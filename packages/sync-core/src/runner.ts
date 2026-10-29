import type { SyncChange, SyncPullResponse, SyncPushItem, SyncPushResponse, SyncTransport } from './protocol.js';
import { isRetryableSyncError, SYNC_PROTOCOL_VERSION, SyncTransportError } from './protocol.js';
import { retryDecision, retryAt } from './backoff.js';
import { selectPushBatch } from './batch.js';
import type { OutboxItem, SyncTransition } from './state.js';
import { transitionForServerResult, transitionForTransportFailure } from './state.js';

export interface SyncRunOptions {
  workspaceId: string;
  deviceId: string;
  cursor: number;
  transport: SyncTransport;
  outbox: OutboxItem[];
  pending?: number;
  now?: number;
  batchSize?: number;
  maxAttempts?: number;
  random?: () => number;
  signal?: AbortSignal;
}

export interface SyncRunResult {
  attempted: number;
  accepted: number;
  conflicts: number;
  failed: number;
  deferred: number;
  pulled: number;
  cursor: number;
  transitions: SyncTransition[];
  changes: SyncChange[];
  pullCompleted: boolean;
  error: string | null;
}

function buildPushItems(items: OutboxItem[]): SyncPushItem[] {
  const ids = new Set<string>();
  for (const item of items) {
    const id = item.command.clientCommandId;
    if (ids.has(id)) throw new SyncTransportError('The sync batch contains a duplicate command id.', 'validation', false);
    ids.add(id);
  }
  return items.map(item => ({
    localSequence: item.localSequence,
    clientCommandId: item.command.clientCommandId,
    command: item.command,
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSequence(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function validateResult(result: unknown): void {
  if (!isRecord(result) || !isNonEmptyString(result.clientCommandId) || !isSequence(result.localSequence)) {
    throw new SyncTransportError('The sync server returned an invalid command result.', 'server', true);
  }

  if (result.status === 'accepted') {
    if (!isSequence(result.revision) || !isSequence(result.serverSequence, 1) || (result.replayed !== undefined && typeof result.replayed !== 'boolean')) {
      throw new SyncTransportError('The sync server returned an invalid accepted result.', 'server', true);
    }
    return;
  }

  if (result.status === 'conflict') {
    if (
      !isSequence(result.revision) ||
      !isRecord(result.conflict) ||
      !isNonEmptyString(result.conflict.code) ||
      !isNonEmptyString(result.conflict.message) ||
      !Array.isArray(result.conflict.fields) ||
      !result.conflict.fields.every(field => typeof field === 'string')
    ) {
      throw new SyncTransportError('The sync server returned an invalid conflict result.', 'server', true);
    }
    return;
  }

  if (result.status === 'rejected') {
    if (
      !isRecord(result.error) ||
      !isNonEmptyString(result.error.code) ||
      !isNonEmptyString(result.error.message) ||
      typeof result.error.retryable !== 'boolean'
    ) {
      throw new SyncTransportError('The sync server returned an invalid rejection result.', 'server', true);
    }
    return;
  }

  throw new SyncTransportError('The sync server returned an unknown command status.', 'server', true);
}

function missingResultTransition(item: OutboxItem, now: number, maxAttempts: number, random: () => number): SyncTransition {
  const delay = retryDecision(item.attempts, { maxAttempts, maxDelayMs: 60_000, random }).delayMs;
  const willRetry = item.attempts + 1 < maxAttempts;
  return {
    localSequence: item.localSequence,
    clientCommandId: item.command.clientCommandId,
    state: willRetry ? 'pending' : 'failed',
    error: 'The sync server did not return a complete response.',
    serverSequence: null,
    retryAt: willRetry ? retryAt(now, delay) : null,
  };
}

function responseFailureTransition(item: OutboxItem, error: unknown, now: number, maxAttempts: number, random: () => number): SyncTransition {
  const message = error instanceof Error ? error.message : 'The sync server returned an invalid response.';
  const retryable = isRetryableSyncError(error);
  const decision = retryDecision(item.attempts, { maxAttempts, random });
  return transitionForTransportFailure(item, message, {
    retry: retryable && decision.shouldRetry,
    retryAt: retryable && decision.shouldRetry ? retryAt(now, decision.delayMs) : null,
    maxAttempts,
  });
}

function ensureResponse(response: SyncPushResponse, expected: SyncPushItem[]): void {
  if (
    !isRecord(response) ||
    response.protocolVersion !== SYNC_PROTOCOL_VERSION ||
    !Array.isArray(response.results) ||
    !isSequence(response.cursor) ||
    (response.retryAfterMs !== undefined && !isSequence(response.retryAfterMs))
  ) {
    throw new SyncTransportError('The sync server returned an invalid push response.', 'server', true);
  }
  const expectedIds = new Set(expected.map(item => item.clientCommandId));
  const seen = new Set<string>();
  for (const result of response.results) {
    validateResult(result);
    if (!expectedIds.has(result.clientCommandId) || seen.has(result.clientCommandId)) {
      throw new SyncTransportError('The sync server returned an unexpected command result.', 'server', true);
    }
    seen.add(result.clientCommandId);
  }
}

const ENTITY_KINDS = new Set(['workspace', 'member', 'project', 'task', 'comment', 'file', 'savedView']);

function validateChange(change: unknown, after: number, cursor: number): asserts change is SyncChange {
  if (
    !isRecord(change) ||
    !isSequence(change.sequence, after + 1) ||
    change.sequence > cursor ||
    !isSequence(change.revision) ||
    !isNonEmptyString(change.id) ||
    typeof change.entity !== 'string' ||
    !ENTITY_KINDS.has(change.entity)
  ) {
    throw new SyncTransportError('The sync server returned an invalid change.', 'server', true);
  }
  if (change.type === 'upsert') {
    if (!isRecord(change.value)) throw new SyncTransportError('The sync server returned an invalid change value.', 'server', true);
    if (change.entity !== 'workspace' && change.value.id !== change.id) {
      throw new SyncTransportError('The sync server returned a mismatched change id.', 'server', true);
    }
    return;
  }
  if (change.type === 'delete') {
    if (change.entity === 'workspace' || !isNonEmptyString(change.deletedAt)) {
      throw new SyncTransportError('The sync server returned an invalid deletion.', 'server', true);
    }
    return;
  }
  throw new SyncTransportError('The sync server returned an unknown change type.', 'server', true);
}

function ensurePullResponse(response: SyncPullResponse, after: number): void {
  if (
    !isRecord(response) ||
    response.protocolVersion !== SYNC_PROTOCOL_VERSION ||
    !isSequence(response.cursor) ||
    response.cursor < after ||
    typeof response.hasMore !== 'boolean' ||
    !Array.isArray(response.changes)
  ) {
    throw new SyncTransportError('The sync server returned an invalid pull response.', 'server', true);
  }

  let previous = after;
  for (const change of response.changes) {
    validateChange(change, previous, response.cursor);
    previous = change.sequence;
  }
}

async function pullChanges(
  transport: SyncTransport,
  workspaceId: string,
  deviceId: string,
  cursor: number,
  signal?: AbortSignal,
): Promise<{ cursor: number; changes: SyncChange[] }> {
  let after = cursor;
  const changes: SyncChange[] = [];
  for (let page = 0; page < 100; page += 1) {
    if (signal?.aborted) throw new SyncTransportError('Sync was cancelled.', 'network', true);
    const response = await transport.pull({
      protocolVersion: SYNC_PROTOCOL_VERSION,
      workspaceId,
      deviceId,
      after,
    });
    ensurePullResponse(response, after);
    changes.push(...response.changes);

    if (response.cursor === after && response.hasMore) {
      throw new SyncTransportError('The sync server did not advance the pull cursor.', 'server', true);
    }
    after = Math.max(after, response.cursor);
    if (!response.hasMore) return { cursor: after, changes };
  }
  throw new SyncTransportError('The sync server returned too many pull pages.', 'server', true);
}

/**
 * One transport-neutral sync pass. It never mutates SQLite or network state;
 * callers persist the returned transitions atomically.
 */
export async function runSyncPass(options: SyncRunOptions): Promise<SyncRunResult> {
  const now = options.now ?? Date.now();
  const maxAttempts = options.maxAttempts ?? 8;
  const items = selectPushBatch(options.outbox, {
    limit: options.batchSize ?? 50,
    now,
  });
  const result: SyncRunResult = {
    attempted: items.length,
    accepted: 0,
    conflicts: 0,
    failed: 0,
    deferred: Math.max(0, (options.pending ?? 0) - items.filter(item => item.state === 'pending').length),
    pulled: 0,
    cursor: options.cursor,
    transitions: [],
    changes: [],
    pullCompleted: false,
    error: null,
  };
  if (options.signal?.aborted) {
    result.error = 'Sync was cancelled.';
    return result;
  }

  if (items.length) {
    let pushItems: SyncPushItem[];
    try {
      pushItems = buildPushItems(items);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The sync batch is invalid.';
      for (const item of items) {
        result.transitions.push(
          transitionForTransportFailure(item, message, {
            retry: false,
            retryAt: null,
            maxAttempts,
          }),
        );
      }
      result.error = message;
      return finishResult(result);
    }
    try {
      const response = await options.transport.push({
        protocolVersion: SYNC_PROTOCOL_VERSION,
        workspaceId: options.workspaceId,
        deviceId: options.deviceId,
        cursor: options.cursor,
        commands: pushItems,
      });
      try {
        ensureResponse(response, pushItems);
      } catch (error) {
        for (const item of items) {
          result.transitions.push(responseFailureTransition(item, error, now, maxAttempts, options.random ?? Math.random));
        }
        result.error = error instanceof Error ? error.message : 'The sync server returned an invalid response.';
        result.failed = result.transitions.filter(item => item.state === 'failed').length;
        return result;
      }
      const byId = new Map(response.results.map(item => [item.clientCommandId, item]));
      let responseComplete = true;
      for (const item of items) {
        const serverResult = byId.get(item.command.clientCommandId);
        if (!serverResult) {
          responseComplete = false;
          result.transitions.push(missingResultTransition(item, now, maxAttempts, options.random ?? Math.random));
          continue;
        }
        const transition =
          serverResult.localSequence === item.localSequence
            ? transitionForServerResult(serverResult, item.attempts, {
                maxAttempts,
                retryAt: failedAttempts => {
                  const decision = retryDecision(failedAttempts, { maxAttempts, random: options.random });
                  return decision.shouldRetry ? retryAt(now, decision.delayMs) : null;
                },
              })
            : responseFailureTransition(
                item,
                new SyncTransportError('The sync server returned a mismatched local sequence.', 'server', true),
                now,
                maxAttempts,
                options.random ?? Math.random,
              );
        if (serverResult.localSequence !== item.localSequence) {
          responseComplete = false;
          result.error ??= transition.error;
        }
        result.transitions.push(transition);
      }
      const missing = result.transitions.find(item => item.error === 'The sync server did not return a complete response.');
      if (missing) result.error ??= missing.error;
      if (!responseComplete) return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The sync server could not be reached.';
      const retryable = isRetryableSyncError(error);
      for (const item of items) {
        const decision = retryDecision(item.attempts, { maxAttempts, random: options.random });
        result.transitions.push(
          transitionForTransportFailure(item, message, {
            retry: retryable && decision.shouldRetry,
            retryAt: retryable && decision.shouldRetry ? retryAt(now, decision.delayMs) : null,
            maxAttempts,
          }),
        );
      }
      result.error = message;
      return finishResult(result);
    }
  }

  const transitioned = new Map(result.transitions.map(item => [item.clientCommandId, item.state]));
  const unresolved = options.outbox.some(item => item.state !== 'synced' && transitioned.get(item.command.clientCommandId) !== 'synced');
  if (unresolved) return finishResult(result);

  try {
    const pulled = await pullChanges(options.transport, options.workspaceId, options.deviceId, options.cursor, options.signal);
    result.cursor = pulled.cursor;
    result.changes = pulled.changes;
    result.pulled = pulled.changes.length;
    result.pullCompleted = true;
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'The sync server could not be reached.';
  }

  return finishResult(result);
}

function finishResult(result: SyncRunResult): SyncRunResult {
  result.accepted = result.transitions.filter(item => item.state === 'synced').length;
  result.conflicts = result.transitions.filter(item => item.state === 'conflict').length;
  result.failed = result.transitions.filter(item => item.state === 'failed').length;
  return result;
}
