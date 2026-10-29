import { BrowserWorkspaceClient, DesktopWorkspaceClient, commandContext } from '@moss/client';

export const workspace = {
  client: null,
  attachments: null,

  async init(snapshot, persist) {
    if (window.mossDesktop) {
      this.client = new DesktopWorkspaceClient(window.mossDesktop);
      this.attachments = window.mossDesktop.attachments ?? null;
      await this.client.initialize();
    } else {
      this.client = new BrowserWorkspaceClient({ snapshot, persist });
      this.attachments = null;
    }
    return this.client;
  },

  execute(type, payload = {}, entityId = null) {
    if (!this.client) throw new Error('Workspace client has not been initialized');
    return this.client.execute({
      ...commandContext('local', snapshotMe(this.client)),
      type,
      ...(entityId ? { entityId } : {}),
      payload,
    });
  },

  async executeOrThrow(type, payload = {}, entityId = null) {
    const result = await this.execute(type, payload, entityId);
    if (!result.ok) throw new Error(result.error.message);
    return result;
  },

  async executeBatchOrThrow(commands) {
    if (!this.client) throw new Error('Workspace client has not been initialized');
    const results = await this.client.executeBatch(
      commands.map(({ type, payload = {}, entityId = null }) => ({
        ...commandContext('local', snapshotMe(this.client)),
        type,
        ...(entityId ? { entityId } : {}),
        payload,
      })),
    );
    const failed = results.find(result => !result.ok);
    if (failed) throw new Error(failed.error.message);
    return results;
  },

  async replaceWorkspace(snapshot) {
    if (!this.client) throw new Error('Workspace client has not been initialized');
    await this.client.replaceSnapshot(snapshot);
  },

  resetDeviceState() {
    try {
      localStorage.removeItem('moss.v2');
    } catch {
      /* storage blocked: the workspace itself has already been replaced */
    }
  },

  snapshot() {
    if (!this.client) throw new Error('Workspace client has not been initialized');
    return this.client.snapshot();
  },

  async syncStatus() {
    return (await this.client?.getSyncStatus?.()) ?? { state: 'local', pending: 0 };
  },

  onSyncStatus(listener) {
    return this.client?.onSyncStatus?.(listener) ?? (() => {});
  },

  onChangePending(listener) {
    return this.client?.onChangePending?.(listener) ?? (() => {});
  },

  async sync() {
    if (!this.client) throw new Error('Workspace client has not been initialized');
    return this.client.sync();
  },

  async retryFailed() {
    if (!this.client) throw new Error('Workspace client has not been initialized');
    return this.client.retryFailed?.() ?? this.client.sync();
  },

  async cleanupAttachments() {
    if (!this.attachments?.cleanup) return 0;
    const keys = this.snapshot()
      .files.map(file => file.storageKey)
      .filter(Boolean);
    return this.attachments.cleanup(keys);
  },
};

function snapshotMe(client) {
  return client.snapshot().me;
}
