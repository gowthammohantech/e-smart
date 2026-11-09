import type { FastifyInstance } from 'fastify';
import { DEMO_SEED_HEADER, DEMO_SEED_TOKEN, INTERNAL_HEADER, INTERNAL_TOKEN } from '../lib/internal';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export class DemoSeedError extends Error {
  constructor(
    readonly method: string,
    readonly url: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`${method} ${url} → ${status}: ${JSON.stringify(body).slice(0, 1500)}`);
    this.name = 'DemoSeedError';
  }
}

/**
 * The demo seeder's view of the API: in-process requests as one signed-in user, through every guard
 * and rule a person meets. The internal header keeps it off the rate limiter; the seed header is the
 * only thing that lets it write to the read-only demo account.
 */
export class DemoApi {
  calls = 0;

  constructor(
    readonly app: FastifyInstance,
    public token: string,
  ) {}

  as(token: string) {
    const other = new DemoApi(this.app, token);
    return other;
  }

  async raw<T = any>(method: Method, url: string, payload?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: T; headers: Record<string, unknown> }> {
    this.calls++;
    const res = await this.app.inject({
      method,
      url: `/v1${url}`,
      headers: {
        ...headers,
        authorization: `Bearer ${this.token}`,
        [INTERNAL_HEADER]: INTERNAL_TOKEN,
        [DEMO_SEED_HEADER]: DEMO_SEED_TOKEN,
        ...(payload !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      payload: payload === undefined ? undefined : JSON.stringify(payload),
    });
    const type = String(res.headers['content-type'] ?? '');
    let body: unknown = undefined;
    if (type.includes('json') && res.body) body = JSON.parse(res.body);
    return { status: res.statusCode, body: body as T, headers: res.headers };
  }

  /** The call, or a DemoSeedError naming exactly what the API refused. */
  async call<T = any>(method: Method, url: string, payload?: unknown, headers?: Record<string, string>): Promise<T> {
    const res = await this.raw<T>(method, url, payload, headers);
    if (res.status >= 300) throw new DemoSeedError(method, url, res.status, res.body);
    return res.body;
  }

  get<T = any>(url: string) {
    return this.call<T>('GET', url);
  }
  post<T = any>(url: string, body: unknown = {}) {
    return this.call<T>('POST', url, body);
  }
  put<T = any>(url: string, body: unknown, headers?: Record<string, string>) {
    return this.call<T>('PUT', url, body, headers);
  }
  patch<T = any>(url: string, body: unknown) {
    return this.call<T>('PATCH', url, body);
  }
}
