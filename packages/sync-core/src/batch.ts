import { isRetryDue } from './backoff.js';
import type { OutboxItem } from './state.js';

export interface SelectBatchOptions {
  limit?: number;
  now: number;
  includeConflict?: boolean;
  includeFailed?: boolean;
}

/**
 * Selects ready work in local order. Synced entries are ignored, conflicts
 * only participate when explicitly requested, terminal failures stay stopped
 * unless explicitly retried, and backed-off entries wait for their timestamp.
 */
export function selectSyncBatch(items: readonly OutboxItem[], options: SelectBatchOptions): OutboxItem[] {
  const limit = Math.max(1, options.limit ?? 50);
  const result: OutboxItem[] = [];
  for (const item of items) {
    if (item.state === 'synced') continue;
    if (item.state === 'conflict' && !options.includeConflict) continue;
    if (item.state === 'failed' && !options.includeFailed) continue;
    if (item.state === 'pending' && !isRetryDue(item.retryAt ?? null, options.now)) continue;
    result.push(item);
    if (result.length === limit) break;
  }
  return result;
}

/**
 * A push batch must stay a contiguous prefix of unsynced local work. Sending a
 * later command while an earlier one is conflicted or failed would apply
 * dependent changes out of order on the server.
 */
export function selectPushBatch(items: readonly OutboxItem[], options: SelectBatchOptions): OutboxItem[] {
  const result: OutboxItem[] = [];
  const limit = Math.max(1, options.limit ?? 50);
  for (const item of items) {
    if (item.state === 'synced') continue;
    if (item.state !== 'pending' || !isRetryDue(item.retryAt ?? null, options.now)) break;
    result.push(item);
    if (result.length === limit) break;
  }
  return result;
}
