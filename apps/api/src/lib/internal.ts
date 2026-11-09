import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';

/**
 * Marks requests the server makes to itself (sync replays through
 * `server.inject`). The value is a per-process secret, so a client can't
 * forge it; the rate limiter skips these because the outer /sync request
 * was already counted.
 */
export const INTERNAL_HEADER = 'x-esmart-internal';
export const INTERNAL_TOKEN = randomBytes(24).toString('base64url');

/**
 * Marks the demo seeder's own in-process requests (src/demo): the only writes the read-only demo
 * account accepts. Per-process and never sent over the network, so nobody outside can carry it.
 */
export const DEMO_SEED_HEADER = 'x-esmart-demo-seed';
export const DEMO_SEED_TOKEN = randomBytes(24).toString('base64url');

export type InjectResult = { status: number; body: unknown };

/** One in-process request as the caller. */
export async function injectAs(
  server: FastifyInstance,
  authorization: string | undefined,
  req: { method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; url: string; payload?: unknown; headers?: Record<string, string> },
): Promise<InjectResult> {
  const headers: Record<string, string> = { ...(req.headers ?? {}) };
  if (authorization) headers.authorization = authorization;
  headers[INTERNAL_HEADER] = INTERNAL_TOKEN;
  if (req.payload !== undefined) headers['content-type'] = 'application/json';
  const res = await server.inject({
    method: req.method,
    url: req.url,
    headers,
    payload: req.payload === undefined ? undefined : JSON.stringify(req.payload),
  });
  const type = String(res.headers['content-type'] ?? '');
  let body: unknown;
  if (type.includes('json') && res.body) {
    try {
      body = JSON.parse(res.body);
    } catch {
      body = undefined;
    }
  }
  return { status: res.statusCode, body };
}
