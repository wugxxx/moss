import type { DatabaseSync } from 'node:sqlite';
import type { SyncStatus } from '@moss/client';
import type { OutboxItem, SyncRunResult, SyncTransportProvider } from '@moss/sync-core';
import { runSyncPass } from '@moss/sync-core';
import { applySyncTransitions, listOutbox, markSyncSucceeded, outboxCount, pendingCount, retryFailedOutbox, setSyncState, syncState } from './outbox.js';
import { SqliteWorkspaceRepository } from './repository.js';
import { transaction } from './sql.js';

export interface SyncRunnerOptions {
  db: DatabaseSync;
  workspaceId: string;
  deviceId: string;
  transport?: SyncTransportProvider;
  autoSyncDelayMs?: number;
  now?: () => number;
  random?: () => number;
  batchSize?: number;
  maxAttempts?: number;
  onStatusChange?: (status: SyncStatus) => void;
}

export class SqliteSyncRunner {
  private inFlight: Promise<SyncStatus> | null = null;
  private scheduled: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: SyncRunnerOptions) {}

  setTransport(transport: SyncTransportProvider): void {
    this.options.transport = transport;
  }

  status(): SyncStatus {
    const state = syncState(this.options.db, this.options.workspaceId);
    const pending = pendingCount(this.options.db, this.options.workspaceId);
    return {
      state: normalizeState(state.lastState, pending),
      pending,
      configured: Boolean(this.options.transport),
      conflictCount: outboxCount(this.options.db, this.options.workspaceId, 'conflict'),
      failedCount: outboxCount(this.options.db, this.options.workspaceId, 'failed'),
      ...(state.lastError ? { lastError: state.lastError } : {}),
      ...(state.lastSyncedAt ? { lastSyncedAt: state.lastSyncedAt } : {}),
    };
  }

  sync(): Promise<SyncStatus> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.run()
      .then(status => {
        try {
          this.options.onStatusChange?.(status);
        } catch (error) {
          console.warn('Sync status listener failed', error);
        }
        return status;
      })
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }

  retryFailed(): Promise<SyncStatus> {
    retryFailedOutbox(this.options.db, this.options.workspaceId);
    return this.sync();
  }

  schedule(delayMs = this.options.autoSyncDelayMs): void {
    if (delayMs === undefined || !this.options.transport) return;
    if (this.scheduled) clearTimeout(this.scheduled);
    this.scheduled = setTimeout(
      () => {
        this.scheduled = null;
        void this.sync().catch(error => console.warn('Scheduled sync failed', error));
      },
      Math.max(0, delayMs),
    );
  }

  dispose(): void {
    if (this.scheduled) clearTimeout(this.scheduled);
    this.scheduled = null;
  }

  private async run(): Promise<SyncStatus> {
    const { db, workspaceId, deviceId } = this.options;
    if (!this.options.transport) {
      setSyncState(db, workspaceId, 'local', null);
      return this.status();
    }
    let result: SyncRunResult;
    try {
      setSyncState(db, workspaceId, 'syncing', null);
      const state = syncState(db, workspaceId);
      const outbox = listOutbox(db, workspaceId, 'all', 1_000).filter(hasActor);
      const transport = await this.options.transport.connect();
      result = await runSyncPass({
        workspaceId,
        deviceId,
        cursor: state.serverCursor,
        transport,
        outbox,
        pending: pendingCount(db, workspaceId),
        now: this.options.now?.(),
        random: this.options.random,
        batchSize: this.options.batchSize,
        maxAttempts: this.options.maxAttempts,
      });
      this.persist(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed.';
      const offline = /fetch|network|offline|timeout|connect|unreachable/i.test(message);
      setSyncState(db, workspaceId, offline ? 'offline' : 'error', message);
    }
    return this.status();
  }

  private persist(result: SyncRunResult): void {
    const { db, workspaceId } = this.options;
    transaction(db, () => {
      if (result.pullCompleted) {
        const repository = new SqliteWorkspaceRepository(db, { workspaceId });
        repository.applySyncChanges(result.changes, result.cursor);
      }
      applySyncTransitions(db, workspaceId, result.transitions, result.cursor);
      if (result.pullCompleted) markSyncSucceeded(db, workspaceId);
      const remaining = pendingCount(db, workspaceId);
      const hasConflict = listOutbox(db, workspaceId, 'conflict', 1).length > 0;
      const hasFailure = listOutbox(db, workspaceId, 'failed', 1).length > 0;
      const next = result.error ? (isOfflineMessage(result.error) ? 'offline' : 'error') : hasConflict || hasFailure ? 'error' : remaining ? 'local' : 'synced';
      setSyncState(db, workspaceId, next, result.error);
    });
  }
}

function hasActor(item: OutboxItem): boolean {
  return Boolean(item.command.actorId);
}

function normalizeState(state: string, pending: number): SyncStatus['state'] {
  if (state === 'syncing' || state === 'offline' || state === 'error') return state;
  if (pending > 0) return 'local';
  return state === 'synced' ? 'synced' : 'local';
}

function isOfflineMessage(message: string): boolean {
  return /fetch|network|offline|timeout|connect|unreachable/i.test(message);
}
