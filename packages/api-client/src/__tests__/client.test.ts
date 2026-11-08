import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient, type Tokens } from '../index';

const BASE = 'https://api.test/v1';

function json(status: number, body: unknown, type = 'application/json') {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': type } });
}

function setup(handler: (req: Request) => Response | Promise<Response>) {
  let tokens: Tokens | null = { accessToken: 'old', refreshToken: 'r1' };
  const seen: Request[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    seen.push(req.clone());
    return handler(req);
  });
  const api = createApiClient({
    baseUrl: BASE,
    getTokens: () => tokens,
    setTokens: (t) => {
      tokens = t;
    },
    idempotencyKey: () => 'key-1',
    fetch: fetchMock as typeof fetch,
  });
  return { api, seen, getTokens: () => tokens };
}

describe('createApiClient', () => {
  it('sends the bearer token and an Idempotency-Key on POST', async () => {
    const { api, seen } = setup(() => json(201, { id: 'pty_1' }));
    await api.POST('/companies/{companyId}/parties', {
      params: { path: { companyId: 'cmp_1' } },
      body: {
        kind: 'customer',
        name: 'Acme',
        currency: 'INR',
        billingAddress: { line1: 'x', city: 'Mumbai', state: 'Maharashtra', postalCode: '400001', country: 'IN' },
        openingBalance: { minor: 0, currency: 'INR' },
        paymentTermsDays: 30,
      },
    });
    expect(seen[0].headers.get('Authorization')).toBe('Bearer old');
    expect(seen[0].headers.get('Idempotency-Key')).toBe('key-1');
  });

  it('leaves public routes unauthenticated', async () => {
    const { api, seen } = setup(() => json(200, []));
    await api.GET('/reference/countries');
    expect(seen[0].headers.get('Authorization')).toBeNull();
  });

  it('signs a GSTIN lookup, which the server only answers for a user', async () => {
    const { api, seen } = setup(() => json(200, {}));
    await api.GET('/reference/gstin/{gstin}', { params: { path: { gstin: '29AABCG4321K1ZM' } } });
    expect(seen[0].headers.get('Authorization')).toBe('Bearer old');
  });

  it('refreshes once on 401 and replays the request with its body', async () => {
    let calls = 0;
    const { api, seen, getTokens } = setup(async (req) => {
      if (req.url.endsWith('/auth/refresh')) return json(200, { accessToken: 'new', refreshToken: 'r2' });
      calls++;
      if (calls === 1) return json(401, { code: 'TOKEN_EXPIRED' }, 'application/problem+json');
      return json(200, { echoed: await req.json() });
    });
    const { data } = await api.POST('/companies/{companyId}/documents/calculate', {
      params: { path: { companyId: 'cmp_1' } },
      body: { kind: 'invoice' } as never,
    });
    expect(getTokens()).toEqual({ accessToken: 'new', refreshToken: 'r2' });
    expect(seen.at(-1)?.headers.get('Authorization')).toBe('Bearer new');
    expect(data).toEqual({ echoed: { kind: 'invoice' } });
  });

  it('signs out when the refresh itself is rejected', async () => {
    const { api, getTokens } = setup(() => json(401, { code: 'SESSION_REVOKED' }, 'application/problem+json'));
    await expect(api.GET('/me')).rejects.toBeInstanceOf(ApiError);
    expect(getTokens()).toBeNull();
  });

  it.each([500, 503, 429, 403, 511])('keeps the session when the refresh answers %i', async (status) => {
    const { api, getTokens } = setup((req) =>
      req.url.endsWith('/auth/refresh') ? json(status, { status }) : json(401, { code: 'TOKEN_EXPIRED' }, 'application/problem+json'),
    );
    await expect(api.GET('/me')).rejects.toBeDefined();
    expect(getTokens()).toEqual({ accessToken: 'old', refreshToken: 'r1' });
  });

  it('keeps the session when something other than the API answers the refresh with 401', async () => {
    const { api, getTokens } = setup((req) =>
      req.url.endsWith('/auth/refresh')
        ? new Response('<html>Sign in to Wi-Fi</html>', { status: 401, headers: { 'content-type': 'text/html' } })
        : json(401, { code: 'TOKEN_EXPIRED' }, 'application/problem+json'),
    );
    await expect(api.GET('/me')).rejects.toBeDefined();
    expect(getTokens()).toEqual({ accessToken: 'old', refreshToken: 'r1' });
  });

  it('gives up on a request that never settles, as on a lost connection', async () => {
    const api = createApiClient({
      baseUrl: BASE,
      getTokens: () => null,
      setTokens: () => {},
      timeoutMs: 10,
      fetch: (() => new Promise(() => {})) as unknown as typeof fetch,
    });
    await expect(api.GET('/me')).rejects.toBeInstanceOf(TypeError);
  });

  it('throws ApiError carrying the problem code and issues', async () => {
    const { api } = setup(() =>
      json(422, { status: 422, code: 'VALIDATION_FAILED', issues: [{ field: 'name', message: 'Required' }] }, 'application/problem+json'),
    );
    const err = await api.GET('/me').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('VALIDATION_FAILED');
    expect((err as ApiError).problem.issues?.[0].field).toBe('name');
  });

  // expo/fetch (Expo 57 on a phone) returns its own response class, not the global Response.
  describe('with a fetch whose responses are not the global Response', () => {
    function foreign(res: Response): Response {
      return {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
        body: res.body,
        bodyUsed: false,
        clone: () => foreign(res.clone()),
        json: () => res.json(),
        text: () => res.text(),
        arrayBuffer: () => res.arrayBuffer(),
        blob: () => res.blob(),
      } as unknown as Response;
    }

    it('reads a successful response', async () => {
      const { api } = setup(() => foreign(json(200, { user: { id: 'usr_1' } })));
      const { data } = await api.GET('/me');
      expect(data).toEqual({ user: { id: 'usr_1' } });
    });

    it('replays after a refresh', async () => {
      let calls = 0;
      const { api } = setup((req) => {
        if (req.url.endsWith('/auth/refresh')) return foreign(json(200, { accessToken: 'new', refreshToken: 'r2' }));
        calls++;
        return foreign(calls === 1 ? json(401, { code: 'TOKEN_EXPIRED' }, 'application/problem+json') : json(200, { user: { id: 'usr_1' } }));
      });
      const { data } = await api.GET('/me');
      expect(data).toEqual({ user: { id: 'usr_1' } });
    });

    it('still throws ApiError for a problem response', async () => {
      const { api } = setup(() => foreign(json(401, { status: 401, code: 'INVALID_CREDENTIALS' }, 'application/problem+json')));
      const err = await api.POST('/auth/sign-in', { body: { email: 'a@b.co', password: 'x' } as never }).catch((e: unknown) => e);
      expect((err as ApiError).code).toBe('INVALID_CREDENTIALS');
    });
  });
});

describe('two tabs sharing one session', () => {
  it('rotates the tokens once: the second tab takes the pair the first one stored', async () => {
    // One browser's storage and lock, two clients (two tabs).
    let tokens: Tokens | null = { accessToken: 'old', refreshToken: 'r1' };
    let held: Promise<unknown> = Promise.resolve();
    const locks = { request: <T>(_name: string, fn: () => Promise<T>) => (held = held.then(fn, fn)) as Promise<T> };
    vi.stubGlobal('navigator', { locks });
    let refreshes = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(input, init);
      if (req.url.endsWith('/auth/refresh')) {
        refreshes++;
        const body = (await req.json()) as { refreshToken: string };
        // The server refuses a refresh token used twice.
        return body.refreshToken === 'r1' ? json(200, { accessToken: 'new', refreshToken: 'r2' }) : json(401, { code: 'REFRESH_TOKEN_INVALID' }, 'application/problem+json');
      }
      return req.headers.get('Authorization') === 'Bearer new' ? json(200, { data: [] }) : json(401, { code: 'TOKEN_EXPIRED' }, 'application/problem+json');
    });
    const tab = () =>
      createApiClient({ baseUrl: BASE, getTokens: () => tokens, setTokens: (t) => void (tokens = t), fetch: fetchMock as typeof fetch });
    const [a, b] = [tab(), tab()];
    const [ra, rb] = await Promise.all([a.GET('/me'), b.GET('/me')]);
    expect(ra.response.status).toBe(200);
    expect(rb.response.status).toBe(200);
    expect(refreshes).toBe(1);
    expect(tokens).toEqual({ accessToken: 'new', refreshToken: 'r2' });
    vi.unstubAllGlobals();
  });
});

describe('transient answers', () => {
  function client(handler: (req: Request, n: number) => Response) {
    let tokens: Tokens | null = { accessToken: 'old', refreshToken: 'r1' };
    const waits: number[] = [];
    let n = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(input instanceof Request ? input : new Request(input, init), ++n));
    const api = createApiClient({
      baseUrl: BASE,
      getTokens: () => tokens,
      setTokens: (t) => void (tokens = t),
      fetch: fetchMock as typeof fetch,
      sleep: async (ms) => void waits.push(ms),
    });
    return { api, waits, calls: () => n, getTokens: () => tokens };
  }
  const limited = (after = '2') => new Response(JSON.stringify({ code: 'RATE_LIMITED' }), { status: 429, headers: { 'content-type': 'application/json', 'retry-after': after } });

  it('waits out a 429 as Retry-After says and keeps the session', async () => {
    const { api, waits, getTokens } = client((_req, n) => (n === 1 ? limited('2') : json(200, { user: { id: 'usr_1' } })));
    const { data } = await api.GET('/me');
    expect(data).toEqual({ user: { id: 'usr_1' } });
    expect(waits).toEqual([2000]);
    expect(getTokens()).not.toBeNull();
  });

  it('gives up after two retries with a 429, still signed in', async () => {
    const { api, calls, getTokens } = client(() => limited('1'));
    await expect(api.GET('/me')).rejects.toMatchObject({ status: 429 });
    expect(calls()).toBe(3);
    expect(getTokens()).not.toBeNull();
  });

  it('does not wait a long Retry-After', async () => {
    const { api, calls } = client(() => limited('45'));
    await expect(api.GET('/me')).rejects.toMatchObject({ status: 429 });
    expect(calls()).toBe(1);
  });

  it('retries a GET after a 503 but not a POST', async () => {
    const down = () => json(503, { status: 503 });
    const get = client((_req, n) => (n === 1 ? down() : json(200, [])));
    await get.api.GET('/companies/{companyId}/parties', { params: { path: { companyId: 'cmp_1' } } });
    expect(get.calls()).toBe(2);
    const post = client(() => down());
    await expect(post.api.POST('/me/delete', { body: {} as never })).rejects.toMatchObject({ status: 503 });
    expect(post.calls()).toBe(1);
  });
});
