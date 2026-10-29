import type { SyncPullRequest, SyncPullResponse, SyncPushRequest, SyncPushResponse, SyncPushResult, SyncTransport, SyncTransportProvider } from './protocol.js';
import { SYNC_PROTOCOL_VERSION } from './protocol.js';

export interface MemorySyncTransportOptions {
  onPush?: (request: SyncPushRequest) => Promise<SyncPushResponse> | SyncPushResponse;
  onPull?: (request: SyncPullRequest) => Promise<SyncPullResponse> | SyncPullResponse;
}

export class MemorySyncTransport implements SyncTransport, SyncTransportProvider {
  pushCalls: SyncPushRequest[] = [];
  pullCalls: SyncPullRequest[] = [];
  private cursor = 0;

  constructor(private readonly options: MemorySyncTransportOptions = {}) {}

  async connect(): Promise<SyncTransport> {
    return this;
  }

  async push(request: SyncPushRequest): Promise<SyncPushResponse> {
    this.pushCalls.push(structuredClone(request));
    if (this.options.onPush) {
      const response = await this.options.onPush(request);
      this.cursor = Math.max(this.cursor, response.cursor);
      return response;
    }
    this.cursor = Math.max(this.cursor, request.cursor) + request.commands.length;
    const firstSequence = this.cursor - request.commands.length + 1;
    return {
      protocolVersion: SYNC_PROTOCOL_VERSION,
      cursor: this.cursor,
      results: request.commands.map<SyncPushResult>((item, index) => ({
        clientCommandId: item.clientCommandId,
        localSequence: item.localSequence,
        status: 'accepted',
        revision: firstSequence + index,
        serverSequence: firstSequence + index,
      })),
    };
  }

  async pull(request: SyncPullRequest): Promise<SyncPullResponse> {
    this.pullCalls.push(structuredClone(request));
    if (this.options.onPull) return this.options.onPull(request);
    return {
      protocolVersion: SYNC_PROTOCOL_VERSION,
      cursor: Math.max(this.cursor, request.after),
      hasMore: false,
      changes: [],
    };
  }
}
