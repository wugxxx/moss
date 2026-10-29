import { describe, expect, it } from 'vitest';
import { HttpSyncTransport } from '@moss/client';
import { SYNC_PROTOCOL_VERSION, SyncTransportError } from '@moss/sync-core';

type RequestCall = { url: string; init: RequestInit };

function requestMock(response: Response | Promise<Response>, calls: RequestCall[] = []): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return response;
  }) as typeof fetch;
}

const pushRequest = {
  protocolVersion: SYNC_PROTOCOL_VERSION,
  workspaceId: 'workspace-1',
  deviceId: 'device-1',
  cursor: 4,
  commands: [],
} as const;

describe('HttpSyncTransport', () => {
  it('rejects missing or non-HTTP endpoints before any request', () => {
    expect(() => new HttpSyncTransport({ baseUrl: '' })).toThrow('absolute HTTP(S) URL');
    expect(() => new HttpSyncTransport({ baseUrl: 'file:///tmp/sync' })).toThrow('must use HTTP or HTTPS');
  });

  it('posts push payloads with JSON and caller-provided headers', async () => {
    const calls: RequestCall[] = [];
    const transport = new HttpSyncTransport({
      baseUrl: 'https://sync.example.test/',
      headers: async () => ({ authorization: 'Bearer test-token' }),
      request: requestMock(
        Response.json({
          protocolVersion: SYNC_PROTOCOL_VERSION,
          cursor: 4,
          results: [],
        }),
        calls,
      ),
    });

    await expect(transport.push(pushRequest)).resolves.toMatchObject({ cursor: 4, results: [] });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://sync.example.test/v1/sync/push');
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.headers).toMatchObject({
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: 'Bearer test-token',
    });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual(pushRequest);
  });

  it('encodes pull parameters into the query string', async () => {
    const calls: RequestCall[] = [];
    const transport = new HttpSyncTransport({
      baseUrl: 'https://sync.example.test',
      request: requestMock(
        Response.json({
          protocolVersion: SYNC_PROTOCOL_VERSION,
          cursor: 9,
          hasMore: false,
          changes: [],
        }),
        calls,
      ),
    });

    await transport.pull({
      protocolVersion: SYNC_PROTOCOL_VERSION,
      workspaceId: 'workspace 1',
      deviceId: 'device/1',
      after: 7,
    });

    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe('/v1/sync/pull');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      protocolVersion: String(SYNC_PROTOCOL_VERSION),
      after: '7',
      workspaceId: 'workspace 1',
      deviceId: 'device/1',
    });
    expect(calls[0]?.init.method).toBe('GET');
    expect(calls[0]?.init.body).toBeUndefined();
    expect(calls[0]?.init.headers).toMatchObject({ accept: 'application/json' });
  });

  it.each([
    [401, 'authentication', false],
    [403, 'authentication', false],
    [408, 'network', true],
    [429, 'rateLimit', true],
    [503, 'server', true],
    [422, 'validation', false],
  ] as const)('maps HTTP %i to a %s error with retryable=%s', async (status, kind, retryable) => {
    const transport = new HttpSyncTransport({
      baseUrl: 'https://sync.example.test',
      request: requestMock(new Response('request failed', { status })),
    });

    const error = await transport.push(pushRequest).catch(value => value);
    expect(error).toBeInstanceOf(SyncTransportError);
    expect(error).toMatchObject({ kind, retryable, statusCode: status, message: 'request failed' });
  });

  it('marks network failures and timeouts as retryable', async () => {
    const network = new HttpSyncTransport({
      baseUrl: 'https://sync.example.test',
      request: (async () => {
        throw new TypeError('fetch failed');
      }) as typeof fetch,
    });
    await expect(network.push(pushRequest)).rejects.toMatchObject({ kind: 'network', retryable: true, message: 'fetch failed' });

    const timeout = new HttpSyncTransport({
      baseUrl: 'https://sync.example.test',
      timeoutMs: 5,
      request: ((_input: string | URL | Request, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        });
      }) as typeof fetch,
    });
    await expect(timeout.push(pushRequest)).rejects.toMatchObject({ kind: 'network', retryable: true, message: 'The sync request timed out.' });
  });

  it('rejects a successful response with invalid JSON', async () => {
    const transport = new HttpSyncTransport({
      baseUrl: 'https://sync.example.test',
      request: requestMock(new Response('not json', { status: 200 })),
    });

    await expect(transport.push(pushRequest)).rejects.toMatchObject({
      kind: 'server',
      retryable: true,
      message: 'The sync server returned invalid JSON.',
    });
  });
});
