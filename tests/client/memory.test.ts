import { describe, expect, it } from 'vitest';
import type { Task } from '@moss/contracts';
import { commandContext, LocalWorkspaceClient, MemoryWorkspaceClient } from '@moss/client';
import { WorkspaceApplication, type WorkspaceCommitContext, type WorkspaceRepository } from '@moss/application';
import { snapshotFixture, taskFixture } from '@moss/test-fixtures';

describe('MemoryWorkspaceClient', () => {
  it('creates, patches, archives, and deletes a task through commands', async () => {
    const client = new MemoryWorkspaceClient(snapshotFixture());

    const created = await client.execute({
      ...commandContext('workspace-1'),
      type: 'task.create',
      payload: { projectId: 'project-1', title: 'New task' },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const taskId = created.affected.ids[0]!;
    expect(await client.query({ type: 'tasks.list' })).toHaveLength(2);

    const patched = await client.execute({
      ...commandContext('workspace-1'),
      type: 'task.patch',
      entityId: taskId,
      payload: { patch: { title: 'Renamed task', status: 'done' } },
    });
    expect(patched.ok).toBe(true);

    const archived = await client.execute({
      ...commandContext('workspace-1'),
      type: 'task.archive',
      entityId: taskId,
      payload: {},
    });
    expect(archived.ok).toBe(true);
    expect(await client.query({ type: 'tasks.list', options: {} })).toHaveLength(1);
    expect(await client.query({ type: 'tasks.list', options: { includeArchived: true } })).toHaveLength(2);

    const deleted = await client.execute({
      ...commandContext('workspace-1'),
      type: 'task.delete',
      entityId: taskId,
      payload: {},
    });
    expect(deleted.ok).toBe(true);
    expect(await client.query({ type: 'tasks.list' })).toHaveLength(1);
  });

  it('creates, edits, reorders, and deletes workspace labels', async () => {
    const client = new MemoryWorkspaceClient(snapshotFixture());
    expect(client.snapshot().labels).toEqual([]);

    const created = await client.execute({
      ...commandContext('workspace-1'),
      type: 'label.create',
      payload: { label: { id: 'customer', name: 'Customer', color: 'blue' } },
    });
    expect(created.ok).toBe(true);
    expect(client.snapshot().labels).toContainEqual({ id: 'customer', name: 'Customer', color: 'blue' });

    await client.execute({
      ...commandContext('workspace-1'),
      type: 'label.create',
      payload: { label: { id: 'priority', name: 'Priority', color: 'amber' } },
    });

    const patched = await client.execute({
      ...commandContext('workspace-1'),
      type: 'label.patch',
      entityId: 'customer',
      payload: { patch: { name: 'Customer feedback', color: 'rose' } },
    });
    expect(patched.ok).toBe(true);
    expect(client.snapshot().labels.find(label => label.id === 'customer')).toMatchObject({ name: 'Customer feedback', color: 'rose' });

    const reordered = await client.execute({
      ...commandContext('workspace-1'),
      type: 'label.reorder',
      payload: { orderedIds: ['customer', 'priority'] },
    });
    expect(reordered.ok).toBe(true);
    expect(
      client
        .snapshot()
        .labels.slice(0, 2)
        .map(label => label.id),
    ).toEqual(['customer', 'priority']);

    await client.execute({
      ...commandContext('workspace-1'),
      type: 'task.patch',
      entityId: 'task-1',
      payload: { patch: { labels: ['priority', 'customer'] } },
    });
    const deleted = await client.execute({
      ...commandContext('workspace-1'),
      type: 'label.delete',
      entityId: 'customer',
      payload: {},
    });
    expect(deleted.ok).toBe(true);
    expect(client.snapshot().labels.some(label => label.id === 'customer')).toBe(false);
    expect(client.snapshot().tasks[0]?.labels).toEqual(['priority']);
  });

  it('removes legacy built-in labels from existing workspaces', () => {
    const snapshot = snapshotFixture();
    snapshot.labels = [
      { id: 'design', name: 'Design', color: 'violet' },
      { id: 'customer', name: 'Customer', color: 'blue' },
    ];
    snapshot.tasks[0]!.labels = ['design', 'customer', 'missing'];
    snapshot.savedViews = [
      {
        id: 'view-1',
        project: 'project-1',
        name: 'Customer work',
        type: 'list',
        filters: [
          { f: 'labels', op: 'any', v: ['design', 'customer', 'missing'] },
          { f: 'status', op: 'any', v: ['todo'] },
        ],
      },
    ];

    const client = new MemoryWorkspaceClient(snapshot);

    expect(client.snapshot().labels).toEqual([{ id: 'customer', name: 'Customer', color: 'blue' }]);
    expect(client.snapshot().tasks[0]?.labels).toEqual(['customer']);
    expect(client.snapshot().savedViews[0]?.filters).toEqual([
      { f: 'labels', op: 'any', v: ['customer'] },
      { f: 'status', op: 'any', v: ['todo'] },
    ]);
  });

  it('normalizes legacy minute-based project activity timestamps', () => {
    const snapshot = snapshotFixture();
    snapshot.projects[0]!.last = 15;
    const before = Date.now() - 15 * 60_000;

    const client = new MemoryWorkspaceClient(snapshot);
    const last = client.snapshot().projects[0]!.last;

    expect(last).toBeGreaterThanOrEqual(before);
    expect(last).toBeLessThanOrEqual(Date.now() - 15 * 60_000);
  });

  it('creates a recurrence when a recurring task is completed', async () => {
    const snapshot = snapshotFixture();
    snapshot.tasks = [
      taskFixture({
        recur: 'Weekly',
        subtasks: [{ id: 'subtask-1', title: 'Step', done: true }],
      }),
    ];
    const client = new MemoryWorkspaceClient(snapshot);

    const result = await client.execute({
      ...commandContext('workspace-1'),
      type: 'task.patch',
      entityId: 'task-1',
      payload: { patch: { status: 'done' } },
    });

    expect(result.ok).toBe(true);
    const tasks = (await client.query({ type: 'tasks.list' })) as Task[];
    expect(tasks).toHaveLength(2);
    expect(tasks.find(task => task.id !== 'task-1')?.subtasks[0]?.done).toBe(false);
  });

  it('creates a project and deletes its tasks atomically', async () => {
    const client = new MemoryWorkspaceClient(snapshotFixture());
    const result = await client.execute({
      ...commandContext('workspace-1'),
      type: 'project.create',
      payload: { name: 'Second project' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const projectId = result.affected.ids[0]!;

    await client.execute({
      ...commandContext('workspace-1'),
      type: 'task.create',
      payload: { projectId, title: 'Project task' },
    });
    expect(await client.query({ type: 'tasks.list' })).toHaveLength(2);

    const removed = await client.execute({
      ...commandContext('workspace-1'),
      type: 'project.delete',
      entityId: projectId,
      payload: {},
    });
    expect(removed.ok).toBe(true);
    expect(await client.query({ type: 'tasks.list' })).toHaveLength(1);
  });

  it('hides an archived project and its tasks without changing task archive state', async () => {
    const snapshot = snapshotFixture();
    snapshot.tasks = [taskFixture({ id: 'task-active', key: 'PRJ-201' }), taskFixture({ id: 'task-archived', key: 'PRJ-202', archived: true })];
    const client = new MemoryWorkspaceClient(snapshot);

    const archivedProject = await client.execute({
      ...commandContext('workspace-1'),
      type: 'project.archive',
      entityId: 'project-1',
      payload: {},
    });
    expect(archivedProject.ok).toBe(true);
    expect(await client.query({ type: 'tasks.list' })).toHaveLength(0);
    expect(await client.query({ type: 'tasks.list', options: { includeArchived: true } })).toHaveLength(2);
    expect(client.snapshot().tasks.find(task => task.id === 'task-active')?.archived).not.toBe(true);

    const restoredProject = await client.execute({
      ...commandContext('workspace-1'),
      type: 'project.restore',
      entityId: 'project-1',
      payload: {},
    });
    expect(restoredProject.ok).toBe(true);
    const activeTasks = (await client.query({ type: 'tasks.list' })) as Task[];
    expect(activeTasks.map(task => task.id)).toEqual(['task-active']);
    expect(client.snapshot().tasks.find(task => task.id === 'task-archived')?.archived).toBe(true);
  });

  it('creates projects with an editable schedule and milestones', async () => {
    const client = new MemoryWorkspaceClient(snapshotFixture());
    const created = await client.execute({
      ...commandContext('workspace-1'),
      type: 'project.create',
      payload: {
        name: 'Scheduled project',
        start: '2026-11-01',
        due: '2026-12-15',
        milestones: [{ name: 'Design approved', date: '2026-11-20' }],
      },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const projectId = created.affected.ids[0]!;
    const patched = await client.execute({
      ...commandContext('workspace-1'),
      type: 'project.patch',
      entityId: projectId,
      payload: {
        patch: {
          start: '2026-11-05',
          milestones: [
            { name: 'Design approved', date: '2026-11-24' },
            { name: 'Launch ready', date: '2026-12-10' },
          ],
        },
      },
    });

    expect(patched.ok).toBe(true);
    expect(client.snapshot().projects.find(project => project.id === projectId)).toMatchObject({
      start: '2026-11-05',
      milestones: [
        { name: 'Design approved', date: '2026-11-24' },
        { name: 'Launch ready', date: '2026-12-10' },
      ],
    });
  });

  it('rejects a project schedule whose start date is after its target date', async () => {
    const client = new MemoryWorkspaceClient(snapshotFixture());
    const result = await client.execute({
      ...commandContext('workspace-1'),
      type: 'project.patch',
      entityId: 'project-1',
      payload: { patch: { start: '2026-12-01', due: '2026-11-30' } },
    });

    expect(result.ok).toBe(false);
    expect(client.snapshot().projects[0]).toMatchObject({ start: '2026-10-01', due: '2026-11-30' });
  });

  it('creates, patches, and deletes a calendar event', async () => {
    const client = new MemoryWorkspaceClient(snapshotFixture());
    const created = await client.execute({
      ...commandContext('workspace-1'),
      type: 'event.create',
      payload: {
        event: {
          id: 'event-1',
          title: 'Design review',
          date: '2026-10-30',
          time: '10:30',
          project: 'project-1',
          notes: 'Review the final concepts.',
        },
      },
    });
    expect(created.ok).toBe(true);
    expect(client.snapshot().events).toContainEqual(expect.objectContaining({ id: 'event-1', title: 'Design review' }));

    const patched = await client.execute({
      ...commandContext('workspace-1'),
      type: 'event.patch',
      entityId: 'event-1',
      payload: { patch: { title: 'Final design review', date: '2026-11-02', time: '14:00' } },
    });
    expect(patched.ok).toBe(true);
    expect(client.snapshot().events[0]).toMatchObject({ title: 'Final design review', date: '2026-11-02', time: '14:00' });

    const deleted = await client.execute({
      ...commandContext('workspace-1'),
      type: 'event.delete',
      entityId: 'event-1',
      payload: {},
    });
    expect(deleted.ok).toBe(true);
    expect(client.snapshot().events).toHaveLength(0);
  });

  it('rejects calendar events with invalid required fields', async () => {
    const client = new MemoryWorkspaceClient(snapshotFixture());
    const noTitle = await client.execute({
      ...commandContext('workspace-1'),
      type: 'event.create',
      payload: {
        event: { id: 'event-1', title: '   ', date: '2026-10-30', time: '10:00', project: 'project-1' },
      },
    });
    expect(noTitle.ok).toBe(false);

    const noProject = await client.execute({
      ...commandContext('workspace-1'),
      type: 'event.create',
      payload: {
        event: { id: 'event-2', title: 'Planning', date: '2026-10-30', time: '10:00', project: 'missing-project' },
      },
    });
    expect(noProject.ok).toBe(false);

    const badDate = await client.execute({
      ...commandContext('workspace-1'),
      type: 'event.create',
      payload: {
        event: { id: 'event-3', title: 'Planning', date: '2026-02-30', time: '10:00', project: 'project-1' },
      },
    });
    expect(badDate.ok).toBe(false);

    const badTime = await client.execute({
      ...commandContext('workspace-1'),
      type: 'event.create',
      payload: {
        event: { id: 'event-4', title: 'Planning', date: '2026-10-30', time: '25:00', project: 'project-1' },
      },
    });
    expect(badTime.ok).toBe(false);
    expect(client.snapshot().events).toHaveLength(0);
  });

  it('rejects a patch to a task that does not exist', async () => {
    const client = new MemoryWorkspaceClient(snapshotFixture());
    const result = await client.execute({
      ...commandContext('workspace-1'),
      type: 'task.patch',
      entityId: 'missing',
      payload: { patch: { title: 'Missing' } },
    });
    expect(result.ok).toBe(false);
  });

  it('normalizes legacy snapshots before applying revisions', async () => {
    const snapshot = snapshotFixture();
    delete (snapshot.tasks[0] as Partial<(typeof snapshot.tasks)[number]>).revision;
    const client = new MemoryWorkspaceClient(snapshot);

    const result = await client.execute({
      ...commandContext('workspace-1'),
      type: 'task.patch',
      entityId: 'task-1',
      payload: { patch: { title: 'Migrated task' } },
    });

    expect(result.ok).toBe(true);
    expect(client.snapshot().tasks[0]?.revision).toBe(1);
  });

  it('creates template tasks and indexes attachments in one project command', async () => {
    const client = new MemoryWorkspaceClient(snapshotFixture());
    const result = await client.execute({
      ...commandContext('workspace-1'),
      type: 'project.create',
      payload: {
        name: 'Template project',
        tasks: [
          {
            title: 'Starter task',
            attachments: [{ id: 'attachment-1', name: 'brief.pdf', type: 'pdf', size: '1 KB', by: 'member-1', at: 1 }],
          },
        ],
      },
    });

    expect(result.ok).toBe(true);
    const snapshot = client.snapshot();
    expect(snapshot.tasks).toHaveLength(2);
    expect(snapshot.files).toContainEqual(expect.objectContaining({ id: 'attachment-1', task: snapshot.tasks[1]?.id }));
  });

  it('deletes a file and its task attachment together', async () => {
    const snapshot = snapshotFixture();
    snapshot.files.push({
      id: 'file-1',
      project: 'project-1',
      task: 'task-1',
      name: 'brief.pdf',
      type: 'pdf',
      size: '1 KB',
      by: 'member-1',
      at: 1,
    });
    snapshot.tasks[0]!.attachments.push({
      id: 'file-1',
      name: 'brief.pdf',
      type: 'pdf',
      size: '1 KB',
      by: 'member-1',
      at: 1,
    });
    const client = new MemoryWorkspaceClient(snapshot);

    const result = await client.execute({
      ...commandContext('workspace-1'),
      type: 'file.delete',
      entityId: 'file-1',
      payload: {},
    });

    expect(result.ok).toBe(true);
    expect(client.snapshot().files).toHaveLength(0);
    expect(client.snapshot().tasks[0]?.attachments).toHaveLength(0);
  });

  it('deletes a legacy task attachment that has no file index record', async () => {
    const snapshot = snapshotFixture();
    snapshot.tasks[0]!.attachments.push({
      id: 'legacy-attachment-1',
      name: 'legacy-brief.pdf',
      type: 'pdf',
      size: '1 KB',
      by: 'member-1',
      at: 1,
    });
    const client = new MemoryWorkspaceClient(snapshot);

    const result = await client.execute({
      ...commandContext('workspace-1'),
      type: 'file.delete',
      entityId: 'legacy-attachment-1',
      payload: {},
    });

    expect(result.ok).toBe(true);
    expect(client.snapshot().tasks[0]?.attachments).toHaveLength(0);
  });

  it('removes indexed files when their owning task is deleted', async () => {
    const snapshot = snapshotFixture();
    snapshot.files.push({
      id: 'file-1',
      project: 'project-1',
      task: 'task-1',
      name: 'brief.pdf',
      type: 'pdf',
      size: '1 KB',
      by: 'member-1',
      at: 1,
      storageKey: 'attachments/00000000-0000-4000-8000-000000000000/00000000-0000-4000-8000-000000000001.pdf',
    });
    const client = new MemoryWorkspaceClient(snapshot);

    const result = await client.execute({
      ...commandContext('workspace-1'),
      type: 'task.delete',
      entityId: 'task-1',
      payload: {},
    });

    expect(result.ok).toBe(true);
    expect(client.snapshot().files).toHaveLength(0);
  });

  it('records task activity for completion, rename, and move', async () => {
    const client = new MemoryWorkspaceClient(snapshotFixture());
    const result = await client.execute({
      ...commandContext('workspace-1'),
      type: 'task.patch',
      entityId: 'task-1',
      payload: { patch: { title: 'Renamed task', status: 'done' } },
    });

    expect(result.ok).toBe(true);
    const activity = client.snapshot().activity;
    expect(activity).toContainEqual(expect.objectContaining({ verb: 'renamed', task: 'task-1', extra: 'to “Renamed task”' }));
    expect(activity).toContainEqual(expect.objectContaining({ verb: 'completed', task: 'task-1' }));
  });

  it('records project activity for status and name changes', async () => {
    const client = new MemoryWorkspaceClient(snapshotFixture());
    const result = await client.execute({
      ...commandContext('workspace-1'),
      type: 'project.patch',
      entityId: 'project-1',
      payload: { patch: { name: 'Renamed project', status: 'active' } },
    });

    expect(result.ok).toBe(true);
    expect(client.snapshot().activity).toContainEqual(expect.objectContaining({ verb: 'renamed project', project: 'project-1' }));
  });

  it('applies bulk patches and records one activity entry per changed task', async () => {
    const snapshot = snapshotFixture();
    snapshot.tasks.push(taskFixture({ id: 'task-2', key: 'PRJ-202', title: 'Second task', order: 2 }));
    const client = new MemoryWorkspaceClient(snapshot);

    const result = await client.execute({
      ...commandContext('workspace-1'),
      type: 'task.bulkPatch',
      payload: { ids: ['task-1', 'task-2'], patch: { status: 'done' } },
    });

    expect(result.ok).toBe(true);
    expect(client.snapshot().tasks.every(task => task.status === 'done')).toBe(true);
    expect(client.snapshot().activity.filter(entry => entry.verb === 'completed')).toHaveLength(2);
  });
});

describe('MemoryWorkspaceClient batch rollback', () => {
  it('restores the last committed snapshot when a command fails', async () => {
    const client = new MemoryWorkspaceClient(snapshotFixture());
    const context = commandContext('workspace-1');
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
        payload: { patch: { title: 'Missing' } },
      },
    ]);

    expect(results.at(-1)?.ok).toBe(false);
    expect(client.snapshot().tasks[0]?.title).toBe('Test task');
  });
});
