import { describe, expect, it } from 'vitest';
import { createApiClient, serverDuration, type RequestTiming } from '../index';

describe('serverDuration', () => {
  it('reads the app entry of Server-Timing', () => {
    expect(serverDuration('app;dur=12.5')).toBe(12.5);
    expect(serverDuration('db;dur=3, app;desc="x";dur=40')).toBe(40);
    expect(serverDuration('db;dur=3')).toBeUndefined();
    expect(serverDuration(null)).toBeUndefined();
  });
});

describe('onTiming', () => {
  it('reports each answered request with the server share', async () => {
    const seen: RequestTiming[] = [];
    const api = createApiClient({
      baseUrl: 'https://api.test/v1',
      getTokens: () => ({ accessToken: 'a', refreshToken: 'r' }),
      setTokens: () => {},
      fetch: (async () =>
        new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json', 'server-timing': 'app;dur=7.2' } })) as typeof fetch,
      onTiming: (t) => seen.push(t),
    });
    await api.GET('/plans' as never);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ method: 'GET', status: 200, serverMs: 7.2 });
    expect(seen[0].ms).toBeGreaterThanOrEqual(0);
  });

  it('never fails a request when the listener throws', async () => {
    const api = createApiClient({
      baseUrl: 'https://api.test/v1',
      getTokens: () => null,
      setTokens: () => {},
      fetch: (async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch,
      onTiming: () => {
        throw new Error('boom');
      },
    });
    await expect(api.GET('/plans' as never)).resolves.toBeDefined();
  });
});
