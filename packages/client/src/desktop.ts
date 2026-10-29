import type { ChangeSet, CommandResult, WorkspaceCommand, WorkspaceQuery, WorkspaceQueryResult, WorkspaceSnapshot } from '@moss/contracts';
import type { AttachmentStorage } from './attachments.js';
import type { SyncStatus, WorkspaceClient } from './contracts.js';

export interface DesktopWorkspaceBridge {
  snapshot(): Promise<WorkspaceSnapshot>;
  replaceSnapshot(snapshot: WorkspaceSnapshot): Promise<WorkspaceSnapshot>;
  query(query: WorkspaceQuery): Promise<WorkspaceQueryResult>;
  execute(command: WorkspaceCommand): Promise<CommandResult>;
  executeBatch(commands: WorkspaceCommand[]): Promise<CommandResult[]>;
  sync(): Promise<SyncStatus>;
  retryFailed(): Promise<SyncStatus>;
  getSyncStatus(): Promise<SyncStatus>;
  onChanged(callback: (status: SyncStatus) => void): () => void;
}

export interface DesktopAppBridge extends DesktopWorkspaceBridge {
  platform: string;
  attachments: AttachmentStorage;
}

export class DesktopWorkspaceClient implements WorkspaceClient {
  private snapshotCache: WorkspaceSnapshot | null = null;
  private syncStatus: SyncStatus = { state: 'offline', pending: 0 };
  private readonly listeners = new Set<(change: ChangeSet) => void>();
  private readonly statusListeners = new Set<(status: SyncStatus) => void>();
  private readonly changePendingListeners = new Set<() => void>();
  private unsubscribe?: () => void;

  constructor(private readonly bridge: DesktopWorkspaceBridge) {}

  async initialize(): Promise<WorkspaceSnapshot> {
    this.snapshotCache = await this.bridge.snapshot();
    this.syncStatus = await this.bridge.getSyncStatus();
    this.unsubscribe = this.bridge.onChanged(status => {
      this.syncStatus = status;
      this.notifyStatus(status);
      this.notifyChangePending();
      void this.refresh();
    });
    return this.snapshotCache;
  }

  async query(query: WorkspaceQuery): Promise<WorkspaceQueryResult> {
    return this.bridge.query(query);
  }

  async execute(command: WorkspaceCommand): Promise<CommandResult> {
    const result = await this.bridge.execute(command);
    if (result.ok) await this.refresh(result.affected, result.revision);
    return result;
  }

  async executeBatch(commands: WorkspaceCommand[]): Promise<CommandResult[]> {
    const results = await this.bridge.executeBatch(commands);
    if (results.some(result => result.ok)) await this.refresh();
    return results;
  }

  subscribe(listener: (change: ChangeSet) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async sync(): Promise<SyncStatus> {
    this.syncStatus = await this.bridge.sync();
    this.notifyStatus(this.syncStatus);
    return this.syncStatus;
  }

  async retryFailed(): Promise<SyncStatus> {
    this.syncStatus = await this.bridge.retryFailed();
    this.notifyStatus(this.syncStatus);
    return this.syncStatus;
  }

  async getSyncStatus(): Promise<SyncStatus> {
    this.syncStatus = await this.bridge.getSyncStatus();
    return this.syncStatus;
  }

  onSyncStatus(listener: (status: SyncStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  onChangePending(listener: () => void): () => void {
    this.changePendingListeners.add(listener);
    return () => this.changePendingListeners.delete(listener);
  }

  snapshot(): WorkspaceSnapshot {
    if (!this.snapshotCache) throw new Error('Desktop workspace client has not been initialized');
    return this.snapshotCache;
  }

  async replaceSnapshot(snapshot: WorkspaceSnapshot): Promise<void> {
    this.snapshotCache = await this.bridge.replaceSnapshot(snapshot);
  }

  private async refresh(affected?: ChangeSet['affected'], revision = 0): Promise<void> {
    const [snapshot, syncStatus] = await Promise.all([this.bridge.snapshot(), this.bridge.getSyncStatus()]);
    this.snapshotCache = snapshot;
    this.syncStatus = syncStatus;
    this.notifyStatus(syncStatus);
    if (affected) {
      const change: ChangeSet = { affected, revision };
      this.listeners.forEach(listener => listener(change));
    }
  }

  dispose(): void {
    this.unsubscribe?.();
  }

  private notifyStatus(status: SyncStatus): void {
    this.statusListeners.forEach(listener => listener(status));
  }

  private notifyChangePending(): void {
    this.changePendingListeners.forEach(listener => listener());
  }
}
