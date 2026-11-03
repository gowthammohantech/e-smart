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
  /** Gives up on a request after this long, as if the connection had dropped. Defaults to two minutes. */
  timeoutMs?: number;
};

// The contract's routes with `security: []`. Reference data is public, but a
// GSTIN lookup, HSN search or road distance reaches a provider and needs a
// signed-in user.
const PUBLIC_PREFIXES = [
  '/auth/',
  '/plans',
  '/reference/countries',
  '/reference/states',
  '/reference/cities',
  '/reference/pincodes/',
  '/reference/currencies',
  '/invites/',
];

function isPublic(url: string, baseUrl: string): boolean {
  const path = url.startsWith(baseUrl) ? url.slice(baseUrl.length) : new URL(url).pathname;
  return PUBLIC_PREFIXES.some((p) => path.startsWith(p)) && !path.startsWith('/auth/sign-out');
}

/** The same response as the global Response class, which some fetch implementations (expo/fetch) don't return. */
async function asStandardResponse(res: Pick<Response, 'status' | 'statusText' | 'headers' | 'arrayBuffer'>): Promise<Response> {
  if (res instanceof Response) return res;
  // These statuses can't carry a body; the Response constructor rejects one.
  const body = [204, 205, 304].includes(res.status) ? null : await res.arrayBuffer();
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

/**
 * The typed client. Every call is checked against the contract at compile
 * time: `api.GET('/companies/{companyId}/parties', { params: { path: { companyId } } })`.
 *
 * It adds the bearer token, an Idempotency-Key on POST, rotates the access
 * token once on a 401 and retries, and turns problem+json into ApiError.
 */
export function createApiClient(options: ApiClientOptions) {
  const rawFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? 120_000;
  /** A request that never settles would otherwise hold up every sync after it. */
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const signal = (input instanceof Request ? input.signal : init?.signal) ?? undefined;
    signal?.addEventListener('abort', () => controller.abort());
    try {
      return await Promise.race([
        rawFetch(input, { ...init, signal: controller.signal }),
        new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new TypeError('The request timed out')))),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }) as typeof fetch;
  const newKey = options.idempotencyKey ?? (() => crypto.randomUUID());
  let refreshing: Promise<Tokens | null> | null = null;
  // A sent request's body is spent, so keep an unsent copy for the one retry.
  const unsent = new WeakMap<Request, Request>();

  /**
   * One rotation for every tab of a browser: under a shared lock, and only if the token the failed
   * request carried is still the current one. Another tab that already rotated it has left the new
   * pair in storage, and spending the old refresh token again would be refused as reuse.
   */
  function refresh(stale: string | undefined): Promise<Tokens | null> {
    const locks = (globalThis as { navigator?: { locks?: { request: <T>(name: string, fn: () => Promise<T>) => Promise<T> } } }).navigator?.locks;
    const run = async () => {
      const current = await options.getTokens();
      if (current && stale && current.accessToken !== stale) return current;
      return rotate(current);
    };
    return locks ? locks.request('ebs.refresh', run) : run();
  }

  async function rotate(current: Tokens | null): Promise<Tokens | null> {
    if (!current) return null;
    const res = await fetchImpl(`${options.baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    });
    if (!res.ok) {
      // Only the API refusing the session ends it. A 5xx, a 429 or a captive
      // portal says nothing about the session, and signing out clears the book.
      const refused = [400, 401, 403].includes(res.status) && (res.headers.get('content-type') ?? '').includes('problem+json');
      if (!refused) throw new TypeError(`Could not refresh the session (HTTP ${res.status})`);
      await options.setTokens(null);
      return null;
    }
    const body = (await res.json().catch(() => {
      throw new TypeError('Could not refresh the session');
    })) as Tokens;
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
      let retried: Response | undefined;
      if (response.status === 401 && !isPublic(request.url, options.baseUrl)) {
        refreshing ??= refresh(request.headers.get('Authorization')?.replace(/^Bearer /, '')).finally(() => {
          refreshing = null;
        });
        const tokens = await refreshing;
        const copy = unsent.get(request);
        if (tokens && copy) {
          copy.headers.set('Authorization', `Bearer ${tokens.accessToken}`);
          retried = await fetchImpl(copy);
        }
      }
      const final = retried ?? response;
      if (!final.ok) {
        const type = final.headers.get('content-type') ?? '';
        const problem: Problem = type.includes('json')
          ? ((await final.clone().json()) as Problem)
          : { status: final.status, title: final.statusText };
        throw new ApiError(final.status, problem);
      }
      // openapi-fetch only takes a returned value that is `instanceof Response`.
      // In Expo, fetch comes from expo/fetch and its responses aren't the global
      // Response, so hand back nothing when the response is unchanged and a
      // standard Response when the retry replaced it.
      return retried ? asStandardResponse(retried) : undefined;
    },
  };

  const client = createClient<paths>({ baseUrl: options.baseUrl, fetch: fetchImpl });
  client.use(middleware);
  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;
