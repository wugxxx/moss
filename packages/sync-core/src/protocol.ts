import type { WorkspaceCommand } from '@moss/contracts';

export const SYNC_PROTOCOL_VERSION = 1;

export interface SyncPushItem {
  localSequence: number;
  clientCommandId: string;
  command: WorkspaceCommand;
}

export interface SyncPushRequest {
  protocolVersion: typeof SYNC_PROTOCOL_VERSION;
  workspaceId: string;
  deviceId: string;
  cursor: number;
  commands: SyncPushItem[];
}

export type SyncPushResult =
  | {
      clientCommandId: string;
      localSequence: number;
      status: 'accepted';
      revision: number;
      serverSequence: number;
      replayed?: boolean;
    }
  | {
      clientCommandId: string;
      localSequence: number;
      status: 'conflict';
      revision: number;
      conflict: {
        code: string;
        message: string;
        fields: string[];
      };
    }
  | {
      clientCommandId: string;
      localSequence: number;
      status: 'rejected';
      error: {
        code: string;
        message: string;
        retryable: boolean;
      };
    };

export interface SyncPushResponse {
  protocolVersion: typeof SYNC_PROTOCOL_VERSION;
  results: SyncPushResult[];
  retryAfterMs?: number;
  /** Highest sequence assigned by this push. It is not a pull cursor. */
  cursor: number;
}

export interface SyncPullRequest {
  protocolVersion: typeof SYNC_PROTOCOL_VERSION;
  workspaceId: string;
  deviceId: string;
  after: number;
}

export type SyncEntityKind = 'workspace' | 'member' | 'project' | 'task' | 'comment' | 'file' | 'savedView';

export interface SyncWorkspaceValue {
  id?: string;
  name: string;
  url?: string;
  c?: string;
  brand?: boolean;
  projOrder: string[];
  me?: string;
  workspaces?: Array<Record<string, unknown>>;
  sessions?: Array<Record<string, unknown>>;
  invoices?: Array<Record<string, unknown>>;
  tfa?: boolean;
  notifPrefs?: Record<string, boolean>;
  labels?: Array<{ id: string; name: string; color: string }>;
}

interface SyncChangeBase {
  /** Monotonically increasing server sequence for this workspace. */
  sequence: number;
  entity: SyncEntityKind;
  id: string;
  revision: number;
}

export type SyncChange =
  | (SyncChangeBase & {
      type: 'upsert';
      value: unknown;
    })
  | (SyncChangeBase & {
      type: 'delete';
      deletedAt: string;
    });

export interface SyncPullResponse {
  protocolVersion: typeof SYNC_PROTOCOL_VERSION;
  cursor: number;
  hasMore: boolean;
  changes: SyncChange[];
}

export interface SyncTransport {
  push(request: SyncPushRequest): Promise<SyncPushResponse>;
  pull(request: SyncPullRequest): Promise<SyncPullResponse>;
}

export interface SyncTransportProvider {
  connect(): Promise<SyncTransport>;
}

export type SyncFailureKind = 'network' | 'authentication' | 'rateLimit' | 'server' | 'validation';

export class SyncTransportError extends Error {
  constructor(
    message: string,
    readonly kind: SyncFailureKind,
    readonly retryable: boolean,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'SyncTransportError';
  }
}

export function isRetryableSyncError(error: unknown): boolean {
  if (error instanceof SyncTransportError) return error.retryable;
  return (
    error instanceof TypeError ||
    (error instanceof Error &&
      /fetch|network|offline|timeout|invalid response|invalid push|unexpected command result|mismatched local sequence/i.test(error.message))
  );
}
