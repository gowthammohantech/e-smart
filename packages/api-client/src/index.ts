import createClient, { type Middleware } from 'openapi-fetch';
import type { paths, Schema } from '@esmart/api-contract';

export type { paths, Schema };
export type Problem = Schema<'Problem'>;

/** A non-2xx response, carrying the server's problem+json body. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly problem: Problem;

  constructor(status: number, problem: Problem) {
    super(problem.detail ?? problem.title ?? `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = problem.code;
    this.problem = problem;
  }
}

export type Tokens = { accessToken: string; refreshToken: string };

export type ApiClientOptions = {
  baseUrl: string;
  /** The current tokens, or null when signed out. */
  getTokens: () => Tokens | null | Promise<Tokens | null>;
  /** Store rotated tokens; called after a successful refresh. */
  setTokens: (tokens: Tokens | null) => void | Promise<void>;
  /** Mints the Idempotency-Key sent with every POST. Defaults to crypto.randomUUID. */
  idempotencyKey?: () => string;
  fetch?: typeof fetch;
};

const PUBLIC_PREFIXES = ['/auth/', '/plans', '/reference/', '/invites/'];

function isPublic(url: string, baseUrl: string): boolean {
  const path = url.startsWith(baseUrl) ? url.slice(baseUrl.length) : new URL(url).pathname;
  return PUBLIC_PREFIXES.some((p) => path.startsWith(p)) && !path.startsWith('/auth/sign-out');
}

/**
 * The typed client. Every call is checked against the contract at compile
 * time: `api.GET('/companies/{companyId}/parties', { params: { path: { companyId } } })`.
 *
 * It adds the bearer token, an Idempotency-Key on POST, rotates the access
 * token once on a 401 and retries, and turns problem+json into ApiError.
 */
export function createApiClient(options: ApiClientOptions) {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const newKey = options.idempotencyKey ?? (() => crypto.randomUUID());
  let refreshing: Promise<Tokens | null> | null = null;
  // A sent request's body is spent, so keep an unsent copy for the one retry.
  const unsent = new WeakMap<Request, Request>();

  async function refresh(): Promise<Tokens | null> {
    const current = await options.getTokens();
    if (!current) return null;
    const res = await fetchImpl(`${options.baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    });
    if (!res.ok) {
      await options.setTokens(null);
      return null;
    }
    const body = (await res.json()) as Tokens;
    const next = { accessToken: body.accessToken, refreshToken: body.refreshToken };
    await options.setTokens(next);
    return next;
  }

  const middleware: Middleware = {
    async onRequest({ request }) {
      if (request.method === 'POST' && !request.headers.has('Idempotency-Key')) {
        request.headers.set('Idempotency-Key', newKey());
      }
      if (!isPublic(request.url, options.baseUrl)) {
        const tokens = await options.getTokens();
        if (tokens) request.headers.set('Authorization', `Bearer ${tokens.accessToken}`);
        unsent.set(request, request.clone());
      }
      return request;
    },
    async onResponse({ request, response }) {
      if (response.status === 401 && !isPublic(request.url, options.baseUrl)) {
        refreshing ??= refresh().finally(() => {
          refreshing = null;
        });
        const tokens = await refreshing;
        const copy = unsent.get(request);
        if (tokens && copy) {
          copy.headers.set('Authorization', `Bearer ${tokens.accessToken}`);
          response = await fetchImpl(copy);
        }
      }
      if (!response.ok) {
        const type = response.headers.get('content-type') ?? '';
        const problem: Problem = type.includes('json')
          ? ((await response.clone().json()) as Problem)
          : { status: response.status, title: response.statusText };
        throw new ApiError(response.status, problem);
      }
      return response;
    },
  };

  const client = createClient<paths>({ baseUrl: options.baseUrl, fetch: fetchImpl });
  client.use(middleware);
  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;
