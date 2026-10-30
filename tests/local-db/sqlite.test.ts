import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Task, WorkspaceSnapshot } from '@moss/contracts';
import { commandContext, LocalWorkspaceClient } from '@moss/client';
import { createSqliteWorkspace, importLegacySnapshot, listOutbox, openDatabase, pendingCount, SqliteWorkspaceRepository } from '@moss/local-db';
import { snapshotFixture, taskFixture } from '@moss/test-fixtures';

const directories: string[] = [];

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'moss-local-db-'));
  directories.push(directory);
  return join(directory, 'workspace.sqlite');
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function createClient(path: string, snapshot?: WorkspaceSnapshot) {
  const db = openDatabase({ path });
  const repository = new SqliteWorkspaceRepository(db);
  const memberCount = db
    .prepare('SELECT COUNT(*) AS count FROM members WHERE workspace_id = ? AND deleted_at IS NULL')
    .get(repository.workspaceId) as unknown as { count: number };
  if (!memberCount.count || snapshot) repository.replaceSnapshot(snapshot ?? snapshotFixture());
  return {
    db,
    repository,
    client: new LocalWorkspaceClient({
      repository,
      syncStatus: () => ({ state: 'local', pending: pendingCount(db, repository.workspaceId) }),
    }),
  };
}

describe('SQLite workspace store', () => {
  it('composes the desktop local client from durable storage', async () => {
    const db = openDatabase({ path: databasePath() });
    const workspace = createSqliteWorkspace(db, { initialSnapshot: snapshotFixture() });
    const result = await workspace.client.execute({
      ...commandContext(workspace.repository.workspaceId),
      type: 'task.patch',
      entityId: 'task-1',
      payload: { patch: { title: 'From composition root' } },
    });

    expect(result.ok).toBe(true);
    expect(workspace.client.getSyncStatus()).toMatchObject({ state: 'local', pending: 1 });
    workspace.db.close();
  });

  it('seeds an empty workspace once without overwriting later changes', async () => {
    const path = databasePath();
    const first = openDatabase({ path });
    const firstWorkspace = createSqliteWorkspace(first, { initialSnapshot: snapshotFixture() });
    expect(firstWorkspace.client.snapshot().tasks).toHaveLength(1);
    await firstWorkspace.client.execute({
      ...commandContext(firstWorkspace.repository.workspaceId),
      type: 'task.patch',
      entityId: 'task-1',
      payload: { patch: { title: 'Durable title' } },
    });
    first.close();

    const second = openDatabase({ path });
    const secondWorkspace = createSqliteWorkspace(second, { initialSnapshot: snapshotFixture() });
    expect(secondWorkspace.client.snapshot().tasks[0]?.title).toBe('Durable title');
    second.close();
  });

  it('persists task changes across a database reopen', async () => {
    const path = databasePath();
    const first = createClient(path);
    const result = await first.client.execute({
      ...commandContext(first.repository.workspaceId),
      type: 'task.patch',
      entityId: 'task-1',
      payload: { patch: { title: 'Persisted task', status: 'done' } },
    });
    expect(result.ok).toBe(true);
    first.db.close();

    const second = createClient(path);
    const task = second.client.snapshot().tasks.find(item => item.id === 'task-1');
    expect(task).toMatchObject({ title: 'Persisted task', status: 'done', revision: 1 });
    second.db.close();
  });

  it('persists calendar events across a database reopen', async () => {
    const path = databasePath();
    const first = createClient(path);
    const result = await first.client.execute({
      ...commandContext(first.repository.workspaceId),
      type: 'event.create',
      payload: {
        event: {
          id: 'event-persisted',
          title: 'Persisted event',
          date: '2026-11-04',
          time: '11:30',
          project: 'project-1',
          notes: 'Stored in workspace settings.',
        },
      },
    });
    expect(result.ok).toBe(true);
    first.db.close();

    const second = createClient(path);
    expect(second.client.snapshot().events.find(event => event.id === 'event-persisted')).toMatchObject({
      title: 'Persisted event',
      date: '2026-11-04',
      time: '11:30',
      project: 'project-1',
      notes: 'Stored in workspace settings.',
    });
    second.db.close();
  });

  it('persists workspace labels across a database reopen', async () => {
    const path = databasePath();
    const first = createClient(path);
    const created = await first.client.execute({
      ...commandContext(first.repository.workspaceId),
      type: 'label.create',
      payload: { label: { id: 'customer', name: 'Customer feedback', color: 'rose' } },
    });
    expect(created.ok).toBe(true);
    first.db.close();

    const second = createClient(path);
    expect(second.client.snapshot().labels.find(label => label.id === 'customer')).toMatchObject({
      name: 'Customer feedback',
      color: 'rose',
    });
    second.db.close();
  });

  it('persists attachment storage metadata across a database reopen', async () => {
    const path = databasePath();
    const first = createClient(path);
    const result = await first.client.execute({
      ...commandContext(first.repository.workspaceId),
      type: 'file.create',
      payload: {
        file: {
          id: 'file-stored-1',
          project: 'project-1',
          task: 'task-1',
          name: 'brief.pdf',
          type: 'pdf',
          size: '19 B',
          by: 'member-1',
          at: 1_700_000_000_000,
          contentType: 'application/pdf',
          byteSize: 19,
          sha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          storageKey: 'attachments/00000000-0000-4000-8000-000000000000/00000000-0000-4000-8000-000000000001.pdf',
        },
      },
    });
    expect(result.ok).toBe(true);
    first.db.close();

    const second = createClient(path);
    expect(second.client.snapshot().files.find(file => file.id === 'file-stored-1')).toMatchObject({
      contentType: 'application/pdf',
      byteSize: 19,
      storageKey: 'attachments/00000000-0000-4000-8000-000000000000/00000000-0000-4000-8000-000000000001.pdf',
    });
    expect(second.client.snapshot().tasks[0]?.attachments[0]?.storageKey).toBe(
      'attachments/00000000-0000-4000-8000-000000000000/00000000-0000-4000-8000-000000000001.pdf',
    );
    second.db.close();
  });

  it('deduplicates repeated client command IDs', async () => {
    const { client, db, repository } = createClient(databasePath());
    const command = {
      ...commandContext(repository.workspaceId),
      type: 'task.create' as const,
      payload: { projectId: 'project-1', title: 'Only once' },
    };

    const first = await client.execute(command);
    const second = await client.execute(command);
    expect(second).toEqual(first);
    expect(client.snapshot().tasks.filter(task => task.title === 'Only once')).toHaveLength(1);
    expect(listOutbox(db, repository.workspaceId)).toHaveLength(1);
    db.close();
  });

  it('commits batches once and writes one outbox row per command', async () => {
    const { client, db, repository } = createClient(databasePath());
    const context = commandContext(repository.workspaceId);
    const results = await client.executeBatch([
      {
        ...context,
        clientCommandId: crypto.randomUUID(),
        type: 'task.patch',
        entityId: 'task-1',
        payload: { patch: { status: 'done' } },
      },
      {
        ...context,
        clientCommandId: crypto.randomUUID(),
        type: 'task.patch',
        entityId: 'task-1',
        payload: { patch: { title: 'Batch renamed' } },
      },
    ]);

    expect(results.every(result => result.ok)).toBe(true);
    expect(client.snapshot().tasks[0]).toMatchObject({ status: 'done', title: 'Batch renamed' });
    expect(listOutbox(db, repository.workspaceId)).toHaveLength(2);
    db.close();
  });

  it('records tombstones when a task is deleted', async () => {
    const { client, db, repository } = createClient(databasePath());
    const command = {
      ...commandContext(repository.workspaceId),
      type: 'task.delete' as const,
      entityId: 'task-1',
      payload: {},
    };
    expect((await client.execute(command)).ok).toBe(true);

    const tombstone = db.prepare('SELECT entity_type, entity_id FROM entity_tombstones WHERE workspace_id = ?').get(repository.workspaceId) as unknown as {
      entity_type: string;
      entity_id: string;
    };
    expect(tombstone).toMatchObject({ entity_type: 'task', entity_id: 'task-1' });
    expect(client.snapshot().tasks).toHaveLength(0);
    db.close();
  });

  it('keeps failed batches out of persistent state', async () => {
    const { client, db, repository } = createClient(databasePath());
    const context = commandContext(repository.workspaceId);
    const results = await client.executeBatch([
      {
        ...context,
        clientCommandId: crypto.randomUUID(),
        type: 'task.patch',
        entityId: 'task-1',
        payload: { patch: { title: 'Should roll back' } },
      },
      {
        ...context,
        clientCommandId: crypto.randomUUID(),
        type: 'task.patch',
        entityId: 'missing',
        payload: { patch: { title: 'Missing task' } },
      },
    ]);

    expect(results.at(-1)?.ok).toBe(false);
    expect(client.snapshot().tasks[0]?.title).toBe('Test task');
    expect(listOutbox(db, repository.workspaceId)).toHaveLength(0);
    db.close();
  });

  it('rebuilds legacy relationships with stable imported IDs', () => {
    const snapshot = snapshotFixture();
    snapshot.tasks.push(taskFixture({ id: 'task-2', key: 'PRJ-202', title: 'Dependent task', deps: ['task-1'] }));
    snapshot.comments.push({ id: 'comment-1', task: 'task-2', by: 'member-1', at: 1, text: 'Hello', re: { '👍': ['member-1'] } });
    snapshot.files.push({ id: 'file-1', project: 'project-1', task: 'task-2', name: 'a.pdf', type: 'pdf', size: '1 KB', by: 'member-1', at: 1 });

    const db = openDatabase({ path: databasePath() });
    const repository = new SqliteWorkspaceRepository(db);
    const imported = importLegacySnapshot(snapshot, repository);
    const restored = repository.snapshot();

    const mappedProject = imported.snapshot.projects[0]!.id;
    const [mappedFirst, mappedSecond] = imported.snapshot.tasks.map(task => task.id);
    expect(restored.me).toMatch(/^legacy-member-/);
    expect(restored.tasks.find(task => task.id === mappedSecond)?.project).toBe(mappedProject);
    expect(restored.tasks.find(task => task.id === mappedSecond)?.deps).toContain(mappedFirst);
    expect(restored.comments[0]?.task).toBe(mappedSecond);
    expect(restored.files[0]?.task).toBe(mappedSecond);
    expect(restored.comments[0]?.re['👍']).toEqual([restored.me]);
    expect(restored.tasks).toHaveLength(2);
    db.close();
  });

  it('returns local sync status with pending outbox count', async () => {
    const { client, db } = createClient(databasePath());
    await client.execute({
      ...commandContext('local'),
      type: 'task.patch',
      entityId: 'task-1',
      payload: { patch: { priority: 'urgent' } satisfies Partial<Task> },
    });
    expect(client.getSyncStatus()).toMatchObject({ state: 'local', pending: 1 });
    db.close();
  });
});
