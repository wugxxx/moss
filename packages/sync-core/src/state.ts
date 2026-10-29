import type { WorkspaceCommand } from '@moss/contracts';
import type { SyncPushResult } from './protocol.js';

export type SyncItemState = 'pending' | 'synced' | 'conflict' | 'failed';

export interface OutboxItem {
  localSequence: number;
  workspaceId: string;
  command: WorkspaceCommand;
  revision: number;
  createdAt: string;
  state: SyncItemState;
  attempts: number;
  lastError: string | null;
  retryAt?: string | null;
  serverSequence?: number | null;
  updatedAt: string;
}

export interface SyncTransition {
  localSequence: number;
  clientCommandId: string;
  state: SyncItemState;
  error: string | null;
  serverSequence: number | null;
  retryAt: string | null;
}

export interface SyncTransitionOptions {
  maxAttempts?: number;
  retryAt?: (nextAttempt: number) => string | null;
}

export function transitionForServerResult(result: SyncPushResult, attempts: number, options: SyncTransitionOptions): SyncTransition {
  const base = {
    localSequence: result.localSequence,
    clientCommandId: result.clientCommandId,
  };
  if (result.status === 'accepted') {
    return {
      ...base,
      state: 'synced',
      error: null,
      serverSequence: result.serverSequence,
      retryAt: null,
    };
  }
  if (result.status === 'conflict') {
    return {
      ...base,
      state: 'conflict',
      error: result.conflict.message,
      serverSequence: null,
      retryAt: null,
    };
  }
  const retryable = result.error.retryable;
  const willRetry = retryable && attempts + 1 < (options.maxAttempts ?? 8);
  return {
    ...base,
    state: willRetry ? 'pending' : 'failed',
    error: result.error.message,
    serverSequence: null,
    retryAt: willRetry ? (options.retryAt?.(attempts) ?? null) : null,
  };
}

export function transitionForTransportFailure(
  item: Pick<OutboxItem, 'localSequence' | 'command' | 'attempts'>,
  error: string,
  retryOrFail: { retry: boolean; retryAt: string | null; maxAttempts?: number },
): SyncTransition {
  const willRetry = retryOrFail.retry && item.attempts + 1 < (retryOrFail.maxAttempts ?? 8);
  return {
    localSequence: item.localSequence,
    clientCommandId: item.command.clientCommandId,
    state: willRetry ? 'pending' : 'failed',
    error,
    serverSequence: null,
    retryAt: willRetry ? retryOrFail.retryAt : null,
  };
}
