import type { FastifyInstance } from 'fastify';
import type { OperationId } from '@esmart/api-contract';
import { RawBody, type Ctx, type Deps, type Handlers, type WebhookHandlers } from '../context';
import { ApiError, unauthorized } from '../http/errors';
import type { Operation } from './spec';

function makeCtx(deps: Deps, op: Operation, req: Parameters<Parameters<FastifyInstance['route']>[0]['handler']>[0], reply: any): Ctx<OperationId> {
  return {
    req,
    reply,
    deps,
    db: deps.db,
    op,
    params: req.params as never,
    query: (req.query ?? {}) as never,
    body: req.body as never,
    now: deps.now(),
    get user() {
      if (!req.authUser) throw unauthorized();
      return req.authUser;
    },
    get maybeUser() {
      return req.authUser;
    },
    get company() {
      if (!req.company) throw new ApiError(500, 'NO_COMPANY_CONTEXT', `${op.id} has no {companyId} in its path`);
      return req.company;
    },
  };
}

/**
 * `style: form, explode: false` arrays arrive as `?kind=a,b`. Split them in
 * preValidation, before the contract's array schema checks the query.
 */
function splitCommaArrays(query: Record<string, unknown> | undefined, op: Operation) {
  if (!query) return;
  for (const name of op.commaArrays) {
    const v = query[name];
    if (typeof v === 'string') query[name] = v.split(',').filter(Boolean);
    else if (Array.isArray(v) && v.length === 1 && typeof v[0] === 'string' && v[0].includes(',')) query[name] = v[0].split(',').filter(Boolean);
  }
}

/**
 * One Fastify route per contract operation, under /v1. The request schema
 * comes from the spec, so a request the contract rejects never reaches a
 * handler. An operation with no handler answers 501, and the contract test
 * fails until every one is implemented.
 */
export function registerRoutes(app: FastifyInstance, deps: Deps, operations: Operation[], handlers: Handlers, webhooks: WebhookHandlers) {
  for (const op of operations) {
    const isWebhook = op.tag === 'Webhooks';
    app.route({
      method: op.method,
      url: `/v1${op.path.replace(/\{([^}]+)\}/g, ':$1')}`,
      schema: isWebhook ? undefined : Object.fromEntries(Object.entries(op.schema).filter(([, v]) => v !== undefined)),
      exposeHeadRoute: false,
      preValidation: async (req) => splitCommaArrays(req.query as Record<string, unknown>, op),
      config: { op, ...(isWebhook ? { rawBody: true } : {}) },
      handler: async (req, reply) => {
        if (isWebhook) {
          const handler = webhooks[op.id as keyof WebhookHandlers];
          if (!handler) throw new ApiError(501, 'NOT_IMPLEMENTED', `${op.id} is not implemented yet`);
          await handler({
            req,
            reply,
            deps,
            db: deps.db,
            rawBody: String((req as { rawBody?: string | Buffer }).rawBody ?? ''),
            body: (req.body ?? {}) as Record<string, unknown>,
            now: deps.now(),
          });
          // The contract declares a bare 200.
          return reply.status(200).send();
        }

        const handler = handlers[op.id as OperationId] as ((ctx: Ctx<OperationId>) => Promise<unknown>) | undefined;
        if (!handler) throw new ApiError(501, 'NOT_IMPLEMENTED', `${op.id} is not implemented yet`);
        void reply.status(op.successStatus);
        const result = await handler(makeCtx(deps, op, req, reply));
        if (reply.sent) return reply;
        if (result instanceof RawBody) {
          void reply.type(result.contentType);
          if (result.filename) void reply.header('content-disposition', `attachment; filename="${result.filename}"`);
          return reply.send(result.body);
        }
        if (result === undefined || reply.statusCode === 204) return reply.status(reply.statusCode === 200 ? 204 : reply.statusCode).send();
        return reply.send(result);
      },
    });
  }
}
