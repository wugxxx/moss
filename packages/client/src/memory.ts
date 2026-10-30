import type { ChangeSet, CommandResult, WorkspaceCommand, WorkspaceQuery, WorkspaceQueryResult, WorkspaceSnapshot } from '@moss/contracts';
import { WorkspaceApplication, type CommandReceipt, type WorkspaceCommitContext, type WorkspaceRepository } from '@moss/application';
import type { SyncStatus, WorkspaceClient } from './contracts.js';
import { normalizeSnapshot } from './normalize.js';
import { listTasks } from './task-query.js';

class MemoryRepository implements WorkspaceRepository {
  private current: WorkspaceSnapshot;
  private readonly commandResults = new Map<string, CommandResult>();
  private readonly commandRevisions = new Map<string, number>();

  constructor(snapshot: WorkspaceSnapshot) {
    this.current = normalizeSnapshot(snapshot);
  }

  snapshot(): WorkspaceSnapshot {
    return structuredClone(this.current);
  }

  replaceSnapshot(snapshot: WorkspaceSnapshot): void {
    this.current = normalizeSnapshot(snapshot);
  }

  findCommandResult(clientCommandId: string): CommandResult | null {
    return this.commandResults.get(clientCommandId) ?? null;
  }

  findCommandReceipt(clientCommandId: string): CommandReceipt | null {
    const result = this.commandResults.get(clientCommandId);
    const revision = this.commandRevisions.get(clientCommandId);
    return result && revision !== undefined ? { result, revision } : null;
  }

  commit({ snapshot, result }: WorkspaceCommitContext): void {
    this.current = normalizeSnapshot(snapshot);
    this.commandResults.set(result.commandId, structuredClone(result));
    this.commandRevisions.set(result.commandId, revisionOf(this.current));
  }

  atomic<T>(run: () => T): T {
    return run();
  }

  atomicBatch<T>(run: () => T): T {
    return run();
  }
}

function revisionOf(snapshot: WorkspaceSnapshot): number {
  return Math.max(0, ...snapshot.tasks.map(task => task.revision), ...snapshot.projects.map(project => project.revision));
}

export class MemoryWorkspaceClient implements WorkspaceClient {
  private readonly repository: MemoryRepository;
  private readonly application: WorkspaceApplication;
  private readonly listeners = new Set<(change: ChangeSet) => void>();

  constructor(snapshot: WorkspaceSnapshot) {
    this.repository = new MemoryRepository(snapshot);
    this.application = new WorkspaceApplication(this.repository);
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
      case 'tasks.list':
        return listTasks(snapshot, query.options);
      case 'task.detail':
        return {
          task: snapshot.tasks.find(task => task.id === query.taskId)!,
          project: snapshot.projects.find(project => project.id === snapshot.tasks.find(task => task.id === query.taskId)?.project) ?? null,
        };
      case 'projects.list':
        return snapshot.projects.filter(project => query.includeArchived || !project.archived);
    }
  }

  execute(command: WorkspaceCommand): Promise<CommandResult> {
    const result = this.application.execute(command);
    if (result.ok) {
      const change: ChangeSet = { revision: result.revision, affected: result.affected };
      this.listeners.forEach(listener => listener(change));
    }
    return Promise.resolve(result);
  }

  async executeBatch(commands: WorkspaceCommand[]): Promise<CommandResult[]> {
    const previous = this.snapshot();
    const results = this.application.executeBatch(commands);
    if (results.some(result => !result.ok)) {
      this.repository.replaceSnapshot(previous);
      return results;
    }
    for (const result of results) {
      if (!result.ok) continue;
      const change: ChangeSet = { revision: result.revision, affected: result.affected };
      this.listeners.forEach(listener => listener(change));
    }
    return results;
  }

  subscribe(listener: (change: ChangeSet) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async sync(): Promise<SyncStatus> {
    return this.getSyncStatus();
  }

  getSyncStatus(): SyncStatus {
    return { state: 'local', pending: 0 };
  }

  snapshot(): WorkspaceSnapshot {
    return this.application.snapshot();
  }

  async replaceSnapshot(snapshot: WorkspaceSnapshot): Promise<void> {
    this.application.replaceSnapshot(snapshot);
  }
}
