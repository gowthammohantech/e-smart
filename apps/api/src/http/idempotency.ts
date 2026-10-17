import { and, eq, lt } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { schema } from '@esmart/db';
import type { Deps } from '../context';
import { sha256 } from '../lib/crypto';
import { ApiError, badRequest } from './errors';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TTL_MS = 24 * 3_600_000;

declare module 'fastify' {
  interface FastifyRequest {
    idempotency: { key: string; userId: string } | null;
  }
}

/**
 * `Idempotency-Key` on POST. The first request with a key runs and its
 * response is stored; a retry with the same key and body gets that response
 * back without running again (so the offline queue can resend freely). The
 * same key with a different body is a client bug and gets 422.
 */
export function registerIdempotency(app: FastifyInstance, deps: Deps) {
  app.decorateRequest('idempotency', null);

  // Runs after the guards (registered earlier), so authUser is known.
  app.addHook('preHandler', async (req, reply) => {
    if (req.method !== 'POST') return;
    const key = req.headers['idempotency-key'];
    const user = req.authUser;
    if (!key || !user) return;
    if (typeof key !== 'string' || !UUID.test(key)) throw badRequest('INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must be a UUID');

    const requestHash = sha256(`${req.method} ${req.url}\n${JSON.stringify(req.body ?? null)}`);
    const now = deps.now();
    const inserted = await deps.db
      .insert(schema.idempotencyKeys)
      .values({ key, userId: user.id, method: 'POST', path: req.url.slice(0, 300), requestHash, expiresAt: new Date(now.getTime() + TTL_MS) })
      .onConflictDoNothing()
      .returning({ key: schema.idempotencyKeys.key });

    if (inserted.length) {
      req.idempotency = { key, userId: user.id };
      return;
    }

    const [prior] = await deps.db
      .select()
      .from(schema.idempotencyKeys)
      .where(and(eq(schema.idempotencyKeys.userId, user.id), eq(schema.idempotencyKeys.key, key)));
    if (!prior) return;
    if (prior.expiresAt < now) {
      // Expired: forget it and run the request fresh.
      await deps.db.delete(schema.idempotencyKeys).where(and(eq(schema.idempotencyKeys.userId, user.id), eq(schema.idempotencyKeys.key, key)));
      return;
    }
    if (prior.requestHash !== requestHash) {
      throw new ApiError(422, 'IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was used for a different request');
    }
    if (prior.responseStatus === null) {
      throw new ApiError(409, 'IDEMPOTENT_REQUEST_IN_PROGRESS', 'The original request is still running');
    }
    void reply.header('Idempotent-Replayed', 'true');
    const body = prior.responseBody as unknown;
    void reply.status(prior.responseStatus);
    if (body === null || body === undefined) return reply.send();
    const isProblem = prior.responseStatus >= 400;
    return reply.type(isProblem ? 'application/problem+json' : 'application/json').send(body);
  });

  app.addHook('onSend', async (req, reply, payload) => {
    const idem = req.idempotency;
    if (!idem) return payload;
    const where = and(eq(schema.idempotencyKeys.userId, idem.userId), eq(schema.idempotencyKeys.key, idem.key));
    // A server error is not a result: free the key so a retry can run.
    if (reply.statusCode >= 500) {
      await deps.db.delete(schema.idempotencyKeys).where(where);
      return payload;
    }
    let body: unknown = null;
    if (typeof payload === 'string' && String(reply.getHeader('content-type') ?? '').includes('json')) {
      try {
        body = JSON.parse(payload);
      } catch {
        body = null;
      }
    }
    await deps.db.update(schema.idempotencyKeys).set({ responseStatus: reply.statusCode, responseBody: body }).where(where);
    return payload;
  });
}

/** Housekeeping: drop expired keys. Called on an interval by the server. */
export async function purgeIdempotencyKeys(deps: Deps) {
  await deps.db.delete(schema.idempotencyKeys).where(lt(schema.idempotencyKeys.expiresAt, deps.now()));
}
