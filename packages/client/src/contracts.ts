import type { ChangeSet, CommandResult, EntityId, WorkspaceCommand, WorkspaceQuery, WorkspaceQueryResult, WorkspaceSnapshot } from '@moss/contracts';

export interface SyncStatus {
  state: 'local' | 'syncing' | 'synced' | 'offline' | 'error';
  pending: number;
  configured?: boolean;
  lastSyncedAt?: string;
  conflictCount?: number;
  failedCount?: number;
  lastError?: string;
}

export interface WorkspaceClient {
  initialize(): Promise<WorkspaceSnapshot>;
  query(query: WorkspaceQuery): Promise<WorkspaceQueryResult>;
  execute(command: WorkspaceCommand): Promise<CommandResult>;
  executeBatch(commands: WorkspaceCommand[]): Promise<CommandResult[]>;
  subscribe(listener: (change: ChangeSet) => void): () => void;
  sync(): Promise<SyncStatus>;
  retryFailed?(): Promise<SyncStatus>;
  getSyncStatus(): SyncStatus | Promise<SyncStatus>;
  onSyncStatus?(listener: (status: SyncStatus) => void): () => void;
  onChangePending?(listener: () => void): () => void;
  snapshot(): WorkspaceSnapshot;
  replaceSnapshot(snapshot: WorkspaceSnapshot): Promise<void>;
}

export function commandContext(workspaceId = 'local', actorId = 'm1') {
  return {
    workspaceId,
    actorId,
    deviceId: 'local-device',
    clientCommandId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
}

export function affectedIds(result: CommandResult): EntityId[] {
  return result.ok ? result.affected.ids : [];
}
