import { describe, expect, it } from 'vitest';
import type { ChangeSet, CommandResult, WorkspaceCommand, WorkspaceQuery, WorkspaceQueryResult, WorkspaceSnapshot } from '@moss/contracts';
import { DesktopWorkspaceClient, type DesktopWorkspaceBridge, type SyncStatus } from '@moss/client';
import { snapshotFixture } from '@moss/test-fixtures';

function command(clientCommandId = 'command-1'): WorkspaceCommand {
  return {
    type: 'task.patch',
    entityId: 'task-1',
    payload: { patch: { title: 'Changed' } },
    workspaceId: 'workspace-1',
    deviceId: 'device-1',
    actorId: 'member-1',
    clientCommandId,
    createdAt: '2026-10-27T10:00:00.000Z',
  };
}

function bridge(overrides: Partial<DesktopWorkspaceBridge> = {}) {
  let snapshot = snapshotFixture();
  let status: SyncStatus = { state: 'local', pending: 0, configured: true };
  let changed: ((status: SyncStatus) => void) | undefined;
  const instance: DesktopWorkspaceBridge = {
    snapshot: async () => structuredClone(snapshot),
    replaceSnapshot: async value => {
      snapshot = structuredClone(value);
      return structuredClone(snapshot);
    },
    query: async (_query: WorkspaceQuery) => snapshot.tasks as WorkspaceQueryResult,
    execute: async (_command: WorkspaceCommand): Promise<CommandResult> => ({
      ok: true,
      commandId: 'command-1',
      affected: { type: 'task', ids: ['task-1'] },
      revision: 1,
    }),
    executeBatch: async () => [],
    sync: async () => status,
    retryFailed: async () => status,
    getSyncStatus: async () => status,
    onChanged: callback => {
      changed = callback;
      return () => {
        if (changed === callback) changed = undefined;
      };
    },
    ...overrides,
  };
  return {
    bridge: instance,
    setSnapshot(value: WorkspaceSnapshot) {
      snapshot = value;
    },
    setStatus(value: SyncStatus) {
      status = value;
    },
    notifyChange(value: SyncStatus) {
      changed?.(value);
    },
  };
}

describe('DesktopWorkspaceClient', () => {
  it('refreshes cached sync status after a successful command', async () => {
    const fake = bridge();
    const client = new DesktopWorkspaceClient(fake.bridge);
    await client.initialize();
    fake.setStatus({ state: 'local', pending: 1, configured: true });

    await client.execute(command());

    await expect(client.getSyncStatus()).resolves.toMatchObject({ state: 'local', pending: 1 });
    client.dispose();
  });

  it('refreshes snapshot and sync status when another window broadcasts a change', async () => {
    const fake = bridge();
    const client = new DesktopWorkspaceClient(fake.bridge);
    await client.initialize();
    const changed = snapshotFixture();
    changed.tasks[0]!.title = 'Changed elsewhere';
    fake.setSnapshot(changed);
    fake.setStatus({ state: 'synced', pending: 0, configured: true });
    const events: ChangeSet[] = [];
    client.subscribe(event => events.push(event));

    fake.notifyChange({ state: 'synced', pending: 0, configured: true });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(client.snapshot().tasks[0]?.title).toBe('Changed elsewhere');
    await expect(client.getSyncStatus()).resolves.toMatchObject({ state: 'synced', pending: 0 });
    expect(events).toEqual([]);
    client.dispose();
  });

  it('notifies the renderer while a broadcast snapshot is being refreshed', async () => {
    const fake = bridge();
    const client = new DesktopWorkspaceClient(fake.bridge);
    await client.initialize();
    let pending = 0;
    client.onChangePending(() => {
      pending += 1;
    });

    fake.notifyChange({ state: 'syncing', pending: 0, configured: true });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(pending).toBe(1);
    expect(client.snapshot().tasks[0]?.title).toBe('Test task');
    client.dispose();
  });
});
