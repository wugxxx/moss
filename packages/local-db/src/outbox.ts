import type { DatabaseSync } from 'node:sqlite';
import type { WorkspaceCommand } from '@moss/contracts';
import type { OutboxItem, SyncTransition } from '@moss/sync-core';

export type OutboxState = 'pending' | 'synced' | 'conflict' | 'failed';

export interface OutboxEntry extends OutboxItem {
  createdAt: string;
}

interface OutboxRow {
  local_sequence: number;
  workspace_id: string;
  client_command_id: string;
  device_id: string;
  actor_id: string;
  command_type: string;
  entity_id: string | null;
  payload: string;
  base_revision: number | null;
  revision: number;
  state: OutboxState;
  attempts: number;
  last_error: string | null;
  retry_at: string | null;
  server_sequence: number | null;
  created_at: string;
  updated_at: string;
}

function toCommand(row: OutboxRow): WorkspaceCommand {
  return {
    workspaceId: row.workspace_id,
    deviceId: row.device_id,
    actorId: row.actor_id,
    clientCommandId: row.client_command_id,
    createdAt: row.created_at,
    baseRevision: row.base_revision,
    type: row.command_type,
    ...(row.entity_id ? { entityId: row.entity_id } : {}),
    payload: JSON.parse(row.payload),
  } as WorkspaceCommand;
}

export function listOutbox(db: DatabaseSync, workspaceId: string, state: OutboxState | 'all' = 'all', limit = 100): OutboxEntry[] {
  const rows =
    state === 'all'
      ? db.prepare('SELECT * FROM sync_outbox WHERE workspace_id = ? ORDER BY local_sequence LIMIT ?').all(workspaceId, limit)
      : db.prepare('SELECT * FROM sync_outbox WHERE workspace_id = ? AND state = ? ORDER BY local_sequence LIMIT ?').all(workspaceId, state, limit);

  return (rows as unknown as OutboxRow[]).map(row => ({
    localSequence: Number(row.local_sequence),
    workspaceId: row.workspace_id,
    command: toCommand(row),
    revision: Number(row.revision),
    state: row.state,
    attempts: Number(row.attempts),
    lastError: row.last_error,
    retryAt: row.retry_at,
    serverSequence: row.server_sequence === null ? null : Number(row.server_sequence),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function applySyncTransitions(
  db: DatabaseSync,
  workspaceId: string,
  transitions: readonly SyncTransition[],
  cursor: number,
  at = new Date().toISOString(),
): void {
  if (transitions.length) {
    const statement = db.prepare(
      `UPDATE sync_outbox
          SET state = ?, attempts = attempts + 1, last_error = ?, retry_at = ?, server_sequence = ?, updated_at = ?
        WHERE workspace_id = ? AND client_command_id = ?`,
    );
    for (const transition of transitions) {
      statement.run(transition.state, transition.error, transition.retryAt, transition.serverSequence, at, workspaceId, transition.clientCommandId);
    }
  }

  db.prepare(
    `UPDATE sync_state
        SET server_cursor = MAX(server_cursor, ?),
            updated_at = ?
      WHERE workspace_id = ?`,
  ).run(cursor, at, workspaceId);
}

export function markSyncSucceeded(db: DatabaseSync, workspaceId: string, at = new Date().toISOString()): void {
  db.prepare(
    `UPDATE sync_state
        SET last_synced_at = ?, updated_at = ?
      WHERE workspace_id = ?`,
  ).run(at, at, workspaceId);
}

export function retryFailedOutbox(db: DatabaseSync, workspaceId: string, at = new Date().toISOString()): number {
  const result = db
    .prepare(
      `UPDATE sync_outbox
          SET state = 'pending', retry_at = NULL, last_error = NULL, updated_at = ?
        WHERE workspace_id = ? AND state = 'failed'`,
    )
    .run(at, workspaceId);
  return Number(result.changes);
}

export function markOutbox(db: DatabaseSync, workspaceId: string, clientCommandIds: string[], state: OutboxState, error: string | null = null): void {
  if (!clientCommandIds.length) return;
  const statement = db.prepare(
    `UPDATE sync_outbox
        SET state = ?, attempts = attempts + 1, last_error = ?, retry_at = NULL, updated_at = ?
      WHERE workspace_id = ? AND client_command_id = ?`,
  );
  const at = new Date().toISOString();
  for (const id of clientCommandIds) statement.run(state, error, at, workspaceId, id);
}

export function pendingCount(db: DatabaseSync, workspaceId: string): number {
  const row = db.prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE workspace_id = ? AND state = 'pending'").get(workspaceId) as unknown as {
    count: number;
  };
  return Number(row.count);
}

export function outboxCount(db: DatabaseSync, workspaceId: string, state: OutboxState): number {
  const row = db.prepare('SELECT COUNT(*) AS count FROM sync_outbox WHERE workspace_id = ? AND state = ?').get(workspaceId, state) as unknown as {
    count: number;
  };
  return Number(row.count);
}

export interface SyncStateRow {
  serverCursor: number;
  lastSyncedAt: string | null;
  lastState: string;
  lastError: string | null;
}

export function syncState(db: DatabaseSync, workspaceId: string): SyncStateRow {
  const row = db.prepare('SELECT * FROM sync_state WHERE workspace_id = ?').get(workspaceId) as unknown as
    { server_cursor: number; last_synced_at: string | null; last_state: string; last_error: string | null } | undefined;
  if (!row) return { serverCursor: 0, lastSyncedAt: null, lastState: 'local', lastError: null };
  return {
    serverCursor: Number(row.server_cursor),
    lastSyncedAt: row.last_synced_at,
    lastState: row.last_state,
    lastError: row.last_error,
  };
}

export function setSyncState(db: DatabaseSync, workspaceId: string, state: string, error: string | null, at = new Date().toISOString()): void {
  db.prepare(
    `UPDATE sync_state
        SET last_state = ?, last_error = ?, updated_at = ?
      WHERE workspace_id = ?`,
  ).run(state, error, at, workspaceId);
}
