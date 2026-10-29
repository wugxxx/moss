import type { ChangeSet, CommandResult, WorkspaceCommand, WorkspaceQuery, WorkspaceQueryResult, WorkspaceSnapshot } from '@moss/contracts';
import type { SyncStatus, WorkspaceClient } from './contracts.js';
import { MemoryWorkspaceClient } from './memory.js';

export interface BrowserWorkspaceClientOptions {
  snapshot: WorkspaceSnapshot;
  persist?: (snapshot: WorkspaceSnapshot) => void;
}

export class BrowserWorkspaceClient implements WorkspaceClient {
  private readonly memory: MemoryWorkspaceClient;
  private readonly persist: (snapshot: WorkspaceSnapshot) => void;

  constructor({ snapshot, persist = () => {} }: BrowserWorkspaceClientOptions) {
    this.memory = new MemoryWorkspaceClient(snapshot);
    this.persist = persist;
  }

  initialize(): Promise<WorkspaceSnapshot> {
    return this.memory.initialize();
  }

  query(query: WorkspaceQuery): Promise<WorkspaceQueryResult> {
    return this.memory.query(query);
  }

  execute(command: WorkspaceCommand): Promise<CommandResult> {
    const result = this.memory.execute(command);
    void result.then(response => {
      if (response.ok) this.persist(this.memory.snapshot());
    });
    return result;
  }

  async executeBatch(commands: WorkspaceCommand[]): Promise<CommandResult[]> {
    const results = await this.memory.executeBatch(commands);
    if (results.some(result => result.ok)) this.persist(this.memory.snapshot());
    return results;
  }

  subscribe(listener: (change: ChangeSet) => void): () => void {
    return this.memory.subscribe(listener);
  }

  sync(): Promise<SyncStatus> {
    return this.memory.sync();
  }

  getSyncStatus(): SyncStatus {
    return this.memory.getSyncStatus();
  }

  snapshot(): WorkspaceSnapshot {
    return this.memory.snapshot();
  }

  async replaceSnapshot(snapshot: WorkspaceSnapshot): Promise<void> {
    this.memory.replaceSnapshot(snapshot);
    this.persist(this.memory.snapshot());
  }
}
