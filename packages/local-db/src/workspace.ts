import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { LocalWorkspaceClient, type SyncStatus } from '@moss/client';
import { SqliteWorkspaceRepository } from './repository.js';
import { SqliteSyncRunner, type SyncRunnerOptions } from './sync.js';
import type { WorkspaceSnapshot } from '@moss/contracts';

export interface SqliteWorkspaceOptions {
  workspaceId?: string;
  initialSnapshot?: WorkspaceSnapshot;
  sync?: () => Promise<SyncStatus>;
  syncRunner?: Omit<SyncRunnerOptions, 'db' | 'workspaceId' | 'deviceId'> & { deviceId?: string };
}

export interface SqliteWorkspace {
  db: DatabaseSync;
  repository: SqliteWorkspaceRepository;
  client: LocalWorkspaceClient;
  syncRunner: SqliteSyncRunner;
}

/**
 * Main-process composition root for the future desktop shell. Callers never
 * receive this module from preload; only the client methods cross IPC.
 */
export function createSqliteWorkspace(db: DatabaseSync, options: SqliteWorkspaceOptions = {}): SqliteWorkspace {
  const repository = new SqliteWorkspaceRepository(db, { workspaceId: options.workspaceId });
  const hasData = db.prepare('SELECT COUNT(*) AS count FROM members WHERE workspace_id = ? AND deleted_at IS NULL').get(repository.workspaceId) as unknown as {
    count: number;
  };
  if (!Number(hasData.count) && options.initialSnapshot) repository.replaceSnapshot(options.initialSnapshot);

  const deviceId = options.syncRunner?.deviceId ?? getOrCreateDeviceId(db, repository.workspaceId);
  let client: LocalWorkspaceClient;
  const syncRunner = new SqliteSyncRunner({
    ...options.syncRunner,
    db,
    workspaceId: repository.workspaceId,
    deviceId,
    onStatusChange: status => {
      options.syncRunner?.onStatusChange?.(status);
      client.notifySyncStatus(status);
    },
  });
  client = new LocalWorkspaceClient({
    repository,
    syncStatus: () => syncRunner.status(),
    sync: options.sync ?? (() => syncRunner.sync()),
    retryFailed: () => syncRunner.retryFailed(),
    prepareCommand: command => ({
      ...command,
      workspaceId: repository.workspaceId,
      deviceId,
    }),
    onCommitted: () => syncRunner.schedule(),
  });

  return { db, repository, client, syncRunner };
}

function getOrCreateDeviceId(db: DatabaseSync, workspaceId: string): string {
  const existing = db.prepare("SELECT data FROM workspace_settings WHERE workspace_id = ? AND kind = 'deviceId'").get(workspaceId) as unknown as
    { data: string } | undefined;
  if (existing) {
    try {
      const value = JSON.parse(existing.data) as unknown;
      if (typeof value === 'string' && value) return value;
    } catch {
      // Replace corrupt device metadata with a fresh stable identifier.
    }
  }

  const deviceId = randomUUID();
  db.prepare(
    `INSERT INTO workspace_settings (workspace_id, kind, data, updated_at)
     VALUES (?, 'deviceId', ?, ?)
     ON CONFLICT (workspace_id, kind) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  ).run(workspaceId, JSON.stringify(deviceId), new Date().toISOString());
  return deviceId;
}
