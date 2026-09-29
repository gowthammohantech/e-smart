import type { FastifyReply, FastifyRequest } from 'fastify';
import { preconditionFailed } from './errors';

export function etagOf(version: number): string {
  return `"v${version}"`;
}

/** Sets the ETag header for a resource at `version`. */
export function setEtag(reply: FastifyReply, version: number): void {
  void reply.header('ETag', etagOf(version));
}

/**
 * Enforces `If-Match` when the client sent one. The header is optional in the
 * contract; without it the write goes ahead (last write wins), with it a
 * stale version gets 412. Accepts `"v3"`, `W/"v3"`, `"3"` and `3`.
 */
export function checkIfMatch(req: FastifyRequest, current: number): void {
  const header = req.headers['if-match'];
  if (!header || header === '*') return;
  const wanted = String(header)
    .split(',')
    .map((t) => Number(t.trim().replace(/^W\//, '').replace(/"/g, '').replace(/^v/, '')));
  if (!wanted.includes(current)) throw preconditionFailed();
}
