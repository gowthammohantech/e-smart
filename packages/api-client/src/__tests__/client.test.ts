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

  it('throws ApiError carrying the problem code and issues', async () => {
    const { api } = setup(() =>
      json(422, { status: 422, code: 'VALIDATION_FAILED', issues: [{ field: 'name', message: 'Required' }] }, 'application/problem+json'),
    );
    const err = await api.GET('/me').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('VALIDATION_FAILED');
    expect((err as ApiError).problem.issues?.[0].field).toBe('name');
  });
});
