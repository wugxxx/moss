import type { SyncPullRequest, SyncPullResponse, SyncPushRequest, SyncPushResponse, SyncTransport } from '@moss/sync-core';
import { SyncTransportError } from '@moss/sync-core';

export interface HttpSyncTransportOptions {
  baseUrl: string;
  request?: typeof fetch;
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
  timeoutMs?: number;
}

export class HttpSyncTransport implements SyncTransport {
  private readonly request: typeof fetch;
  private readonly baseUrl: string;

  constructor(private readonly options: HttpSyncTransportOptions) {
    this.request = options.request ?? ((input, init) => globalThis.fetch(input, init));
    const baseUrl = options.baseUrl.trim();
    let parsed: URL;
    try {
      parsed = new URL(baseUrl);
    } catch {
      throw new Error('The sync endpoint must be an absolute HTTP(S) URL.');
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('The sync endpoint must use HTTP or HTTPS.');
    }
    this.baseUrl = parsed.href.replace(/\/+$/, '');
  }

  push(request: SyncPushRequest): Promise<SyncPushResponse> {
    return this.send('/v1/sync/push', request);
  }

  pull(request: SyncPullRequest): Promise<SyncPullResponse> {
    const query = new URLSearchParams({
      protocolVersion: String(request.protocolVersion),
      after: String(request.after),
      workspaceId: request.workspaceId,
      deviceId: request.deviceId,
    });
    return this.send(`/v1/sync/pull?${query}`, null, true);
  }

  private async send<T>(path: string, body: unknown, forceQuery = false): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 20_000);
    try {
      const headers = await this.options.headers?.();
      const response = await this.request(`${this.baseUrl}${path}`, {
        method: forceQuery ? 'GET' : 'POST',
        headers: {
          accept: 'application/json',
          ...(forceQuery ? {} : { 'content-type': 'application/json' }),
          ...headers,
        },
        ...(forceQuery ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const kind =
          response.status === 401 || response.status === 403
            ? 'authentication'
            : response.status === 429
              ? 'rateLimit'
              : response.status === 408 || response.status === 425
                ? 'network'
                : response.status >= 500
                  ? 'server'
                  : 'validation';
        const retryable = kind === 'server' || kind === 'rateLimit' || kind === 'network';
        const text = await response.text().catch(() => '');
        throw new SyncTransportError(text || `Sync request failed with HTTP ${response.status}.`, kind, retryable, response.status);
      }
      try {
        return (await response.json()) as T;
      } catch {
        throw new SyncTransportError('The sync server returned invalid JSON.', 'server', true, response.status);
      }
    } catch (error) {
      if (error instanceof SyncTransportError) throw error;
      if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw new SyncTransportError('The sync request timed out.', 'network', true);
      }
      throw new SyncTransportError(error instanceof Error ? error.message : 'The sync server could not be reached.', 'network', true);
    } finally {
      clearTimeout(timeout);
    }
  }
}
