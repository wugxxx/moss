import { describe, expect, it } from 'vitest';
import type { WorkspaceCommand } from '@moss/contracts';
import {
  MemorySyncTransport,
  retryDecision,
  runSyncPass,
  selectPushBatch,
  selectSyncBatch,
  SYNC_PROTOCOL_VERSION,
  SyncTransportError,
  type OutboxItem,
} from '@moss/sync-core';

const now = Date.parse('2026-10-27T10:00:00.000Z');

function command(id: string, actorId = 'member-1'): WorkspaceCommand {
  return {
    type: 'task.patch',
    entityId: 'task-1',
    payload: { patch: { title: id } },
    workspaceId: 'workspace-1',
    deviceId: 'device-1',
    actorId,
    clientCommandId: id,
    createdAt: '2026-10-27T09:00:00.000Z',
  };
}

function outboxItem(sequence: number, overrides: Partial<OutboxItem> = {}): OutboxItem {
  const id = `command-${sequence}`;
  return {
    localSequence: sequence,
    workspaceId: 'workspace-1',
    command: command(id),
    revision: sequence,
    state: 'pending',
    attempts: 0,
    lastError: null,
    retryAt: null,
    serverSequence: null,
    createdAt: '2026-10-27T09:00:00.000Z',
    updatedAt: '2026-10-27T09:00:00.000Z',
    ...overrides,
  };
}

describe('sync-core batch selection', () => {
  it('keeps local sequence, skips terminal rows, and honors retry timestamps', () => {
    const items = [
      outboxItem(4, { state: 'synced' }),
      outboxItem(2, { state: 'conflict' }),
      outboxItem(6, { state: 'failed' }),
      outboxItem(1),
      outboxItem(3, { retryAt: new Date(now + 60_000).toISOString() }),
      outboxItem(5),
    ];

    expect(selectSyncBatch(items, { now, limit: 2 }).map(item => item.localSequence)).toEqual([1, 5]);
    expect(selectSyncBatch(items, { now, includeConflict: true }).map(item => item.localSequence)).toEqual([2, 1, 5]);
    expect(selectSyncBatch(items, { now, includeFailed: true }).map(item => item.localSequence)).toEqual([6, 1, 5]);
  });

  it('uses bounded exponential backoff with jitter and a retry ceiling', () => {
    expect(retryDecision(0, { baseDelayMs: 1_000, random: () => 1 })).toEqual({ shouldRetry: true, delayMs: 1_000 });
    expect(retryDecision(3, { baseDelayMs: 1_000, random: () => 1 })).toEqual({ shouldRetry: true, delayMs: 8_000 });
    expect(retryDecision(4, { baseDelayMs: 1_000, maxDelayMs: 5_000, random: () => 1 })).toEqual({ shouldRetry: true, delayMs: 5_000 });
    expect(retryDecision(8, { maxAttempts: 8 })).toEqual({ shouldRetry: false, delayMs: 0 });
  });

  it('never sends dependent pending commands across a blocked command', () => {
    const items = [outboxItem(1), outboxItem(2, { state: 'conflict' }), outboxItem(3), outboxItem(4, { state: 'failed' }), outboxItem(5)];
    expect(selectPushBatch(items, { now }).map(item => item.localSequence)).toEqual([1]);
    expect(selectPushBatch(items.slice(1), { now })).toEqual([]);
  });
});

describe('sync-core runner', () => {
  it('sends a stable batch and persists the returned cursor', async () => {
    const transport = new MemorySyncTransport();
    const result = await runSyncPass({
      workspaceId: 'workspace-1',
      deviceId: 'device-1',
      cursor: 40,
      transport,
      outbox: [outboxItem(1), outboxItem(2)],
      now,
      random: () => 1,
    });

    expect(transport.pushCalls).toHaveLength(1);
    expect(transport.pushCalls[0]).toMatchObject({
      protocolVersion: SYNC_PROTOCOL_VERSION,
      workspaceId: 'workspace-1',
      deviceId: 'device-1',
      cursor: 40,
    });
    expect(transport.pushCalls[0]?.commands.map(item => item.localSequence)).toEqual([1, 2]);
    expect(result).toMatchObject({ accepted: 2, conflicts: 0, failed: 0, cursor: 42, pulled: 0, error: null });
    expect(result.transitions.every(item => item.state === 'synced')).toBe(true);
  });

  it('keeps outbox rows pending with a durable retry time when the network fails', async () => {
    const transport = new MemorySyncTransport({
      onPush: () => {
        throw new SyncTransportError('fetch failed', 'network', true);
      },
    });
    const result = await runSyncPass({
      workspaceId: 'workspace-1',
      deviceId: 'device-1',
      cursor: 0,
      transport,
      outbox: [outboxItem(1, { attempts: 2 })],
      now,
      random: () => 1,
    });

    expect(result.error).toBe('fetch failed');
    expect(result.transitions[0]).toMatchObject({ state: 'pending', error: 'fetch failed' });
    expect(result.transitions[0]?.retryAt).toBe(new Date(now + 4_000).toISOString());
  });

  it('marks non-retryable transport failures as failed without scheduling a retry', async () => {
    const transport = new MemorySyncTransport({
      onPush: () => {
        throw new SyncTransportError('Invalid command', 'validation', false);
      },
    });
    const result = await runSyncPass({
      workspaceId: 'workspace-1',
      deviceId: 'device-1',
      cursor: 0,
      transport,
      outbox: [outboxItem(1)],
      now,
    });

    expect(result.transitions[0]).toMatchObject({ state: 'failed', retryAt: null, error: 'Invalid command' });
  });

  it('persists server conflicts and retryable per-command rejections', async () => {
    const transport = new MemorySyncTransport({
      onPush: request => ({
        protocolVersion: SYNC_PROTOCOL_VERSION,
        cursor: 8,
        results: request.commands.map(item =>
          item.localSequence === 1
            ? {
                clientCommandId: item.clientCommandId,
                localSequence: item.localSequence,
                status: 'conflict' as const,
                revision: 7,
                conflict: { code: 'REVISION_CONFLICT', message: 'Title changed remotely.', fields: ['title'] },
              }
            : {
                clientCommandId: item.clientCommandId,
                localSequence: item.localSequence,
                status: 'rejected' as const,
                error: { code: 'BUSY', message: 'Try again shortly.', retryable: true },
              },
        ),
      }),
    });

    const result = await runSyncPass({
      workspaceId: 'workspace-1',
      deviceId: 'device-1',
      cursor: 0,
      transport,
      outbox: [outboxItem(1), outboxItem(2)],
      now,
      random: () => 1,
    });

    expect(result).toMatchObject({ accepted: 0, conflicts: 1, failed: 0, cursor: 0, pulled: 0 });
    expect(result.transitions[0]).toMatchObject({ state: 'conflict', error: 'Title changed remotely.', retryAt: null });
    expect(result.transitions[1]).toMatchObject({ state: 'pending', error: 'Try again shortly.' });
    expect(result.transitions[1]?.retryAt).toBe(new Date(now + 1_000).toISOString());
  });

  it('rejects malformed responses instead of losing commands', async () => {
    const transport = new MemorySyncTransport({
      onPush: request => ({
        protocolVersion: SYNC_PROTOCOL_VERSION,
        cursor: 1,
        results: [
          {
            clientCommandId: request.commands[0]!.clientCommandId,
            localSequence: 99,
            status: 'accepted',
            revision: 1,
            serverSequence: 1,
          },
          {
            clientCommandId: request.commands[0]!.clientCommandId,
            localSequence: 1,
            status: 'accepted',
            revision: 1,
            serverSequence: 1,
          },
        ],
      }),
    });

    const result = await runSyncPass({
      workspaceId: 'workspace-1',
      deviceId: 'device-1',
      cursor: 0,
      transport,
      outbox: [outboxItem(1)],
      now,
    });

    expect(result.error).toBe('The sync server returned an unexpected command result.');
    expect(result.transitions[0]).toMatchObject({
      state: 'pending',
      error: 'The sync server returned an unexpected command result.',
    });
    expect(result.transitions[0]?.retryAt).not.toBeNull();
  });

  it('rejects unknown result statuses and keeps the cursor unchanged', async () => {
    const transport = new MemorySyncTransport({
      onPush: request => ({
        protocolVersion: SYNC_PROTOCOL_VERSION,
        cursor: 99,
        results: [
          {
            clientCommandId: request.commands[0]!.clientCommandId,
            localSequence: 1,
            status: 'unexpected',
          } as never,
        ],
      }),
    });

    const result = await runSyncPass({
      workspaceId: 'workspace-1',
      deviceId: 'device-1',
      cursor: 41,
      transport,
      outbox: [outboxItem(1)],
      now,
    });

    expect(result.cursor).toBe(41);
    expect(result.error).toBe('The sync server returned an unknown command status.');
    expect(result.transitions[0]).toMatchObject({ state: 'pending' });
  });

  it('does not advance the cursor when a command result is missing', async () => {
    const transport = new MemorySyncTransport({
      onPush: () => ({
        protocolVersion: SYNC_PROTOCOL_VERSION,
        cursor: 99,
        results: [],
      }),
    });

    const result = await runSyncPass({
      workspaceId: 'workspace-1',
      deviceId: 'device-1',
      cursor: 41,
      transport,
      outbox: [outboxItem(1)],
      now,
    });

    expect(result.cursor).toBe(41);
    expect(result.error).toBe('The sync server did not return a complete response.');
    expect(result.transitions[0]).toMatchObject({ state: 'pending' });
  });

  it('fails a malformed local batch without sending it', async () => {
    const transport = new MemorySyncTransport();
    const duplicate = command('command-1');
    const result = await runSyncPass({
      workspaceId: 'workspace-1',
      deviceId: 'device-1',
      cursor: 0,
      transport,
      outbox: [outboxItem(1, { command: duplicate }), outboxItem(2, { command: duplicate })],
      now,
    });

    expect(transport.pushCalls).toHaveLength(0);
    expect(result.error).toBe('The sync batch contains a duplicate command id.');
    expect(result.transitions).toHaveLength(2);
    expect(result.transitions.every(item => item.state === 'failed')).toBe(true);
  });
});
