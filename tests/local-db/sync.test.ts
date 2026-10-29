import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commandContext } from '@moss/client';
import { createSqliteWorkspace, listOutbox, openDatabase, syncState } from '@moss/local-db';
import { MemorySyncTransport, SyncTransportError } from '@moss/sync-core';
import { snapshotFixture } from '@moss/test-fixtures';

const directories: string[] = [];

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'moss-sync-'));
  directories.push(directory);
  return join(directory, 'workspace.sqlite');
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('SQLite sync runner', () => {
  it('starts as local rather than falsely reporting an empty unconfigured workspace as synced', () => {
    const db = openDatabase({ path: databasePath() });
    const workspace = createSqliteWorkspace(db, { initialSnapshot: snapshotFixture() });

    expect(workspace.syncRunner.status()).toMatchObject({ state: 'local', pending: 0, configured: false });
    db.close();
  });

  it('reports an unconfigured local workspace without touching the network', async () => {
    const db = openDatabase({ path: databasePath() });
    const workspace = createSqliteWorkspace(db, { initialSnapshot: snapshotFixture() });
    await workspace.client.execute({
      ...commandContext(workspace.repository.workspaceId),
      type: 'task.patch',
      entityId: 'task-1',
      payload: { patch: { title: 'Still local' } },
    });

    expect(workspace.syncRunner.status()).toMatchObject({ state: 'local', pending: 1, configured: false });
    expect(await workspace.client.sync()).toMatchObject({ state: 'local', pending: 1, configured: false });
    db.close();
  });

  it('pushes pending commands and persists the authoritative sync state', async () => {
    const db = openDatabase({ path: databasePath() });
    const transport = new MemorySyncTransport();
    const workspace = createSqliteWorkspace(db, {
      initialSnapshot: snapshotFixture(),
      syncRunner: { transport },
    });
    const command = {
      ...commandContext(workspace.repository.workspaceId),
      type: 'task.patch' as const,
      entityId: 'task-1',
      payload: { patch: { title: 'Synced title' } },
    };
    await workspace.client.execute(command);

    const status = await workspace.client.sync();
    expect(status).toMatchObject({ state: 'synced', pending: 0, conflictCount: 0, failedCount: 0, configured: true });
    expect(transport.pushCalls[0]?.deviceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(listOutbox(db, workspace.repository.workspaceId, 'synced')[0]?.command).toMatchObject({
      workspaceId: workspace.repository.workspaceId,
      deviceId: transport.pushCalls[0]?.deviceId,
      actorId: command.actorId,
      clientCommandId: command.clientCommandId,
      baseRevision: 0,
    });
    expect(listOutbox(db, workspace.repository.workspaceId, 'synced')[0]).toMatchObject({
      command: expect.objectContaining({ actorId: command.actorId, clientCommandId: command.clientCommandId }),
      attempts: 1,
      serverSequence: 1,
    });
    expect(syncState(db, workspace.repository.workspaceId)).toMatchObject({ serverCursor: 1, lastState: 'synced' });
    db.close();
  });

  it('persists a retry deadline across restart and skips the backed-off batch', async () => {
    const path = databasePath();
    const firstDb = openDatabase({ path });
    const firstTransport = new MemorySyncTransport({
      onPush: () => {
        throw new SyncTransportError('fetch failed', 'network', true);
      },
    });
    const now = Date.parse('2026-10-27T10:00:00.000Z');
    const first = createSqliteWorkspace(firstDb, {
      initialSnapshot: snapshotFixture(),
      syncRunner: { transport: firstTransport, now: () => now, random: () => 1, maxAttempts: 8 },
    });
    await first.client.execute({
      ...commandContext(first.repository.workspaceId),
      type: 'task.patch',
      entityId: 'task-1',
      payload: { patch: { title: 'Offline edit' } },
    });

    expect(await first.client.sync()).toMatchObject({ state: 'offline', pending: 1, configured: true });
    expect(listOutbox(firstDb, first.repository.workspaceId, 'pending')[0]?.retryAt).toBe(new Date(now + 1_000).toISOString());
    firstDb.close();

    const secondDb = openDatabase({ path });
    const secondTransport = new MemorySyncTransport();
    const second = createSqliteWorkspace(secondDb, {
      initialSnapshot: snapshotFixture(),
      syncRunner: { transport: secondTransport, now: () => now },
    });
    expect(await second.client.sync()).toMatchObject({ state: 'local', pending: 1 });
    expect(secondTransport.pushCalls).toHaveLength(0);
    expect(await second.client.sync()).toMatchObject({ state: 'local', pending: 1 });
    secondDb.close();
  });

  it('does not automatically resend a terminal non-retryable failure', async () => {
    const db = openDatabase({ path: databasePath() });
    const transport = new MemorySyncTransport({
      onPush: () => {
        throw new SyncTransportError('The command is invalid.', 'validation', false);
      },
    });
    const workspace = createSqliteWorkspace(db, {
      initialSnapshot: snapshotFixture(),
      syncRunner: { transport },
    });
    await workspace.client.execute({
      ...commandContext(workspace.repository.workspaceId),
      type: 'task.patch',
      entityId: 'task-1',
      payload: { patch: { title: 'Cannot sync' } },
    });

    expect(await workspace.client.sync()).toMatchObject({ state: 'error', pending: 0, failedCount: 1, configured: true });
    expect(await workspace.client.sync()).toMatchObject({ state: 'error', pending: 0, failedCount: 1, configured: true });
    expect(transport.pushCalls).toHaveLength(1);
    expect(listOutbox(db, workspace.repository.workspaceId, 'failed')[0]).toMatchObject({ attempts: 1, lastError: 'The command is invalid.' });
    db.close();
  });

  it('debounces automatic sync after committed local commands', async () => {
    vi.useFakeTimers();
    try {
      const db = openDatabase({ path: databasePath() });
      const transport = new MemorySyncTransport();
      const statuses: string[] = [];
      const workspace = createSqliteWorkspace(db, {
        initialSnapshot: snapshotFixture(),
        syncRunner: {
          transport,
          autoSyncDelayMs: 1_000,
          onStatusChange: status => statuses.push(status.state),
        },
      });
      await workspace.client.execute({
        ...commandContext(workspace.repository.workspaceId),
        type: 'task.patch',
        entityId: 'task-1',
        payload: { patch: { title: 'First edit' } },
      });
      await workspace.client.execute({
        ...commandContext(workspace.repository.workspaceId),
        type: 'task.patch',
        entityId: 'task-1',
        payload: { patch: { title: 'Second edit' } },
      });

      await vi.advanceTimersByTimeAsync(999);
      expect(transport.pushCalls).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(transport.pushCalls).toHaveLength(1);
      expect(transport.pushCalls[0]?.commands).toHaveLength(2);
      expect(await workspace.client.sync()).toMatchObject({ state: 'synced', pending: 0 });
      expect(statuses).toContain('synced');

      workspace.syncRunner.dispose();
      db.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('pulls remote changes in order and advances the cursor atomically', async () => {
    const db = openDatabase({ path: databasePath() });
    const transport = new MemorySyncTransport({
      onPull: () => ({
        protocolVersion: 1,
        cursor: 2,
        hasMore: false,
        changes: [
          {
            sequence: 1,
            entity: 'task',
            id: 'task-1',
            type: 'upsert',
            revision: 3,
            value: { ...snapshotFixture().tasks[0], title: 'Remote title', revision: 3 },
          },
          {
            sequence: 2,
            entity: 'workspace',
            id: 'local',
            type: 'upsert',
            revision: 1,
            value: { name: 'Remote workspace', projOrder: ['project-1'] },
          },
        ],
      }),
    });
    const workspace = createSqliteWorkspace(db, {
      initialSnapshot: snapshotFixture(),
      syncRunner: { transport },
    });

    expect(await workspace.client.sync()).toMatchObject({ state: 'synced', pending: 0 });
    expect(transport.pullCalls[0]).toMatchObject({ after: 0, workspaceId: workspace.repository.workspaceId });
    expect(workspace.client.snapshot().tasks[0]?.title).toBe('Remote title');
    expect(workspace.client.snapshot().tasks[0]?.revision).toBe(3);
    expect(workspace.client.snapshot().ws.name).toBe('Remote workspace');
    expect(syncState(db, workspace.repository.workspaceId)).toMatchObject({ serverCursor: 2, lastState: 'synced' });
    expect(workspace.syncRunner.status().lastSyncedAt).toBeTruthy();
    db.close();
  });

  it('applies remote tombstones without pulling them back into the snapshot', async () => {
    const db = openDatabase({ path: databasePath() });
    const transport = new MemorySyncTransport({
      onPull: () => ({
        protocolVersion: 1,
        cursor: 1,
        hasMore: false,
        changes: [
          {
            sequence: 1,
            entity: 'task',
            id: 'task-1',
            type: 'delete',
            revision: 2,
            deletedAt: '2026-10-27T10:00:00.000Z',
          },
        ],
      }),
    });
    const workspace = createSqliteWorkspace(db, {
      initialSnapshot: snapshotFixture(),
      syncRunner: { transport },
    });

    expect(await workspace.client.sync()).toMatchObject({ state: 'synced', pending: 0 });
    expect(workspace.client.snapshot().tasks).toHaveLength(0);
    expect(
      db.prepare("SELECT entity_type FROM entity_tombstones WHERE workspace_id = ? AND entity_id = 'task-1'").get(workspace.repository.workspaceId),
    ).toMatchObject({
      entity_type: 'task',
    });
    db.close();
  });

  it('does not schedule another sync when a command is replayed idempotently', async () => {
    const db = openDatabase({ path: databasePath() });
    const transport = new MemorySyncTransport();
    const workspace = createSqliteWorkspace(db, {
      initialSnapshot: snapshotFixture(),
      syncRunner: { transport, autoSyncDelayMs: 0 },
    });
    const replay = {
      ...commandContext(workspace.repository.workspaceId),
      type: 'task.patch' as const,
      entityId: 'task-1',
      payload: { patch: { title: 'Replay-safe' } },
    };
    await workspace.client.execute(replay);
    await new Promise(resolve => setTimeout(resolve, 10));
    const calls = transport.pushCalls.length;
    const commands = transport.pushCalls.flatMap(call => call.commands).length;
    await workspace.client.execute(replay);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(transport.pushCalls).toHaveLength(calls);
    expect(transport.pushCalls.flatMap(call => call.commands)).toHaveLength(commands);
    workspace.syncRunner.dispose();
    db.close();
  });

  it('does not pull while local changes are unresolved', async () => {
    const db = openDatabase({ path: databasePath() });
    const transport = new MemorySyncTransport({
      onPush: request => ({
        protocolVersion: 1,
        cursor: request.cursor + request.commands.length,
        results: request.commands.map(item => ({
          clientCommandId: item.clientCommandId,
          localSequence: item.localSequence,
          status: 'conflict',
          revision: 1,
          conflict: { code: 'REVISION_CONFLICT', message: 'Conflict', fields: ['title'] },
        })),
      }),
    });
    const workspace = createSqliteWorkspace(db, { initialSnapshot: snapshotFixture(), syncRunner: { transport } });
    await workspace.client.execute({
      ...commandContext(workspace.repository.workspaceId),
      type: 'task.patch',
      entityId: 'task-1',
      payload: { patch: { title: 'Local title' } },
    });

    expect(await workspace.client.sync()).toMatchObject({ state: 'error', pending: 0, conflictCount: 1 });
    expect(transport.pullCalls).toHaveLength(0);
    expect(syncState(db, workspace.repository.workspaceId).serverCursor).toBe(0);
    db.close();
  });

  it('does not advance the pull cursor when a remote change is malformed', async () => {
    const db = openDatabase({ path: databasePath() });
    const transport = new MemorySyncTransport({
      onPull: () => ({
        protocolVersion: 1,
        cursor: 1,
        hasMore: false,
        changes: [{ sequence: 1, entity: 'task', id: 'task-1', type: 'upsert', revision: 2, value: { id: 'other-task' } }],
      }),
    });
    const workspace = createSqliteWorkspace(db, { initialSnapshot: snapshotFixture(), syncRunner: { transport } });

    expect(await workspace.client.sync()).toMatchObject({ state: 'error' });
    expect(syncState(db, workspace.repository.workspaceId).serverCursor).toBe(0);
    expect(workspace.client.snapshot().tasks[0]?.title).toBe('Test task');
    db.close();
  });
});
