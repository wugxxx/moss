import type { ChangeSet, CommandResult, WorkspaceCommand, WorkspaceQuery, WorkspaceQueryResult, WorkspaceSnapshot } from '@moss/contracts';
import type { WorkspaceRepository } from '@moss/application';
import { WorkspaceApplication } from '@moss/application';
import type { SyncStatus, WorkspaceClient } from './contracts.js';

export interface LocalWorkspaceClientOptions {
  repository: WorkspaceRepository;
  syncStatus?: () => SyncStatus;
  sync?: () => Promise<SyncStatus>;
  retryFailed?: () => Promise<SyncStatus>;
  prepareCommand?: (command: WorkspaceCommand) => WorkspaceCommand;
  onCommitted?: (commands: readonly WorkspaceCommand[]) => void;
}

/**
 * Host-neutral local client. The desktop preload can instantiate this against a
 * SQLite repository without exposing database access to the renderer.
 */
export class LocalWorkspaceClient implements WorkspaceClient {
  private readonly application: WorkspaceApplication;
  private readonly listeners = new Set<(change: ChangeSet) => void>();
  private readonly statusListeners = new Set<(status: SyncStatus) => void>();
  private readonly status: () => SyncStatus;
  private readonly syncImpl?: () => Promise<SyncStatus>;
  private readonly retryFailedImpl?: () => Promise<SyncStatus>;
  private readonly prepareCommand: (command: WorkspaceCommand) => WorkspaceCommand;
  private readonly onCommitted?: (commands: readonly WorkspaceCommand[]) => void;

  constructor({
    repository,
    syncStatus = () => ({ state: 'local', pending: 0 }),
    sync,
    retryFailed,
    prepareCommand = command => command,
    onCommitted,
  }: LocalWorkspaceClientOptions) {
    this.application = new WorkspaceApplication(repository);
    this.status = syncStatus;
    this.syncImpl = sync;
    this.retryFailedImpl = retryFailed;
    this.prepareCommand = prepareCommand;
    this.onCommitted = onCommitted;
  }

  async initialize(): Promise<WorkspaceSnapshot> {
    return this.snapshot();
  }

  async query(query: WorkspaceQuery): Promise<WorkspaceQueryResult> {
    const snapshot = this.snapshot();
    switch (query.type) {
      case 'bootstrap':
      case 'workspace.snapshot':
        return snapshot;
      case 'tasks.list': {
        const { projectId, includeArchived = false } = query.options ?? {};
        return snapshot.tasks.filter(task => (!projectId || task.project === projectId) && (includeArchived || !task.archived));
      }
      case 'task.detail': {
        const task = snapshot.tasks.find(item => item.id === query.taskId);
        return {
          task: task!,
          project: snapshot.projects.find(project => project.id === task?.project) ?? null,
        };
      }
      case 'projects.list':
        return snapshot.projects.filter(project => query.includeArchived || !project.archived);
    }
  }

  execute(command: WorkspaceCommand): Promise<CommandResult> {
    const prepared = this.prepareCommand(command);
    const duplicate = this.application.hasCommandResult(prepared.clientCommandId);
    const receipt = this.application.commandReceipt(prepared);
    if (receipt.result.ok && !duplicate) {
      this.emit(receipt.revision, receipt.result.affected);
      this.onCommitted?.([prepared]);
    }
    return Promise.resolve(receipt.result);
  }

  async executeBatch(commands: WorkspaceCommand[]): Promise<CommandResult[]> {
    const prepared = commands.map(command => this.prepareCommand(command));
    const results = this.application.executeBatch(prepared);
    if (results.length > 0 && results.every(result => result.ok)) {
      for (const result of results) {
        if (result.ok) this.emit(result.revision, result.affected);
      }
      this.onCommitted?.(prepared);
    }
    return results;
  }

  subscribe(listener: (change: ChangeSet) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  sync(): Promise<SyncStatus> {
    return this.syncImpl ? this.syncImpl() : Promise.resolve(this.getSyncStatus());
  }

  retryFailed(): Promise<SyncStatus> {
    return this.retryFailedImpl ? this.retryFailedImpl() : this.sync();
  }

  getSyncStatus(): SyncStatus {
    return this.status();
  }

  onSyncStatus(listener: (status: SyncStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  notifySyncStatus(status: SyncStatus): void {
    this.statusListeners.forEach(listener => listener(status));
  }

  snapshot(): WorkspaceSnapshot {
    return this.application.snapshot();
  }

  async replaceSnapshot(snapshot: WorkspaceSnapshot): Promise<void> {
    this.application.replaceSnapshot(snapshot);
  }

  private emit(revision: number, affected: ChangeSet['affected']): void {
    const change: ChangeSet = { revision, affected };
    this.listeners.forEach(listener => listener(change));
  }
}
