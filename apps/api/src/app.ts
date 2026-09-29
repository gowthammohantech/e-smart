import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import rawBody from 'fastify-raw-body';
import type { Ajv } from 'ajv';
import { initI18n } from '@esmart/i18n';
import { registerGuards } from './auth/guards';
import type { Deps, Handlers, WebhookHandlers } from './context';
import { problemHandler } from './http/errors';
import { registerIdempotency } from './http/idempotency';
import { handlers as defaultHandlers, webhookHandlers as defaultWebhooks } from './modules';
import { registerRoutes } from './openapi/routes';
import { loadOperations } from './openapi/spec';
import { MemoryStorage } from './providers';
import { INTERNAL_HEADER, INTERNAL_TOKEN } from './lib/internal';

export type BuildOptions = {
  logger?: boolean | object;
  /** Swap handlers in tests. */
  handlers?: Handlers;
  webhooks?: WebhookHandlers;
};

/**
 * Builds the server. Routes, request validation, auth, tenancy, roles and
 * plan gating all come from the OpenAPI contract; modules only supply the
 * handler for each operationId.
 */
export async function buildApp(deps: Deps, opts: BuildOptions = {}): Promise<FastifyInstance> {
  // English labels for server-rendered text (PDFs, messages). The domain
  // formatters read the shared i18next instance.
  initI18n('en');

  const app = Fastify({
    logger: opts.logger ?? { level: deps.config.LOG_LEVEL },
    trustProxy: true,
    bodyLimit: 5 * 1024 * 1024,
    genReqId: () => crypto.randomUUID(),
    ajv: {
      customOptions: { strict: false, coerceTypes: 'array', removeAdditional: false, allErrors: true },
      plugins: [
        (ajv: Ajv) => {
          // OpenAPI formats that describe rather than constrain.
          for (const f of ['int32', 'int64', 'float', 'double', 'binary', 'byte', 'password']) ajv.addFormat(f, true);
          return ajv;
        },
      ],
    },
  });

  problemHandler(app);

  await app.register(cors, {
    origin: deps.config.CORS_ORIGINS === '*' ? true : deps.config.CORS_ORIGINS.split(',').map((s) => s.trim()),
    exposedHeaders: ['ETag', 'Idempotent-Replayed', 'Content-Disposition'],
    allowedHeaders: ['Authorization', 'Content-Type', 'If-Match', 'Idempotency-Key'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.register(rateLimit, {
    max: deps.config.RATE_LIMIT_PER_MINUTE,
    timeWindow: '1 minute',
    allowList: (req) => req.headers[INTERNAL_HEADER] === INTERNAL_TOKEN,
    // Per user once signed in, per IP before.
    keyGenerator: (req) => req.headers.authorization?.slice(-24) ?? req.ip,
    errorResponseBuilder: (_req, ctx) => ({
      statusCode: 429,
      code: 'RATE_LIMITED',
      message: `Too many requests; retry in ${Math.ceil(ctx.ttl / 1000)}s`,
    }),
  });
  await app.register(jwt, { secret: deps.config.JWT_SECRET });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
  await app.register(rawBody, { global: false, encoding: 'utf8', runFirst: true });

  registerGuards(app, deps);
  registerIdempotency(app, deps);

  if (deps.providers.storage instanceof MemoryStorage) deps.providers.storage.routes(app);

  app.get('/health', async () => {
    await deps.pool.query('select 1');
    return { ok: true };
  });

  const { operations } = await loadOperations();
  registerRoutes(app, deps, operations, opts.handlers ?? defaultHandlers, opts.webhooks ?? defaultWebhooks);

  return app;
}
