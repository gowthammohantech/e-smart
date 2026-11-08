import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import rawBody from 'fastify-raw-body';
import type { Ajv } from 'ajv';
import { EMAIL_RE } from '@esmart/core/lib/validators';
import { setSandboxGstinsAllowed } from '@esmart/core/domain/gstin';
import { initI18n } from '@esmart/i18n';
import { registerGuards } from './auth/guards';
import type { Deps, Handlers, WebhookHandlers } from './context';
import { problemHandler } from './http/errors';
import { registerIdempotency } from './http/idempotency';
import { registerAppVersionGate } from './http/appVersion';
import { handlers as defaultHandlers, webhookHandlers as defaultWebhooks } from './modules';
import { registerRoutes } from './openapi/routes';
import { loadOperations } from './openapi/spec';
import { MemoryStorage } from './providers';
import { INTERNAL_HEADER, INTERNAL_TOKEN } from './lib/internal';
import { registerMcp } from './lixi/mcp';
import { registerSharePages } from './modules/documents/share';

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
  // NIC's sandbox GSTIN shape (`29AAGCB1286Q000`), admitted only when TAXATION_GSTIN_ALLOW_SANDBOX says so.
  setSandboxGstinsAllowed(deps.config.TAXATION_GSTIN_ALLOW_SANDBOX);

  const app = Fastify({
    logger: opts.logger ?? {
      level: deps.config.LOG_LEVEL,
      // Never in the logs: tokens, passwords, codes, portal logins.
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-esmart-internal"]', '*.password', '*.refreshToken', '*.accessToken', '*.otpCode', '*.token', '*.secret', 'err.config.headers'],
        censor: '[redacted]',
      },
    },
    // Only Railway's edge proxy: a client-written X-Forwarded-For beyond it is ignored.
    // The same as a hop count: address i counts from the socket outwards.
    trustProxy: (_addr: string, i: number) => i < deps.config.TRUST_PROXY_HOPS,
    bodyLimit: 5 * 1024 * 1024,
    // A caller's (or Railway's) request id is kept, so one id follows a request through every log.
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
    ajv: {
      customOptions: { strict: false, coerceTypes: 'array', removeAdditional: false, allErrors: true },
      plugins: [
        (ajv: Ajv) => {
          // OpenAPI formats that describe rather than constrain.
          for (const f of ['int32', 'int64', 'float', 'double', 'binary', 'byte', 'password']) ajv.addFormat(f, true);
          // The app's email rule. Capitals pass here; handlers store the address lowercased.
          ajv.addFormat('email', (s: string) => EMAIL_RE.test(s.trim().toLowerCase()));
          return ajv;
        },
      ],
    },
  });

  problemHandler(app);

  await app.register(cors, {
    origin: deps.config.CORS_ORIGINS === '*' ? true : deps.config.CORS_ORIGINS.split(',').map((s) => s.trim()),
    exposedHeaders: ['ETag', 'Idempotent-Replayed', 'Content-Disposition', 'Server-Timing', 'Retry-After'],
    allowedHeaders: ['Authorization', 'Content-Type', 'If-Match', 'Idempotency-Key', 'X-App-Version'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.register(rateLimit, {
    max: deps.config.RATE_LIMIT_PER_MINUTE,
    timeWindow: '1 minute',
    allowList: (req) => req.headers[INTERNAL_HEADER] === INTERNAL_TOKEN,
    // Per user once signed in, per IP before. Only a token this server signed names a user: anything
    // else counts against the IP, so a made-up header can't buy a fresh bucket.
    keyGenerator: (req) => {
      const header = req.headers.authorization;
      if (header?.startsWith('Bearer ')) {
        try {
          return `u:${app.jwt.verify<{ sub: string }>(header.slice(7)).sub}`;
        } catch {
          // Expired or forged.
        }
      }
      return `ip:${req.ip}`;
    },
    errorResponseBuilder: (_req, ctx) => ({
      statusCode: 429,
      code: 'RATE_LIMITED',
      message: `Too many requests; retry in ${Math.ceil(ctx.ttl / 1000)}s`,
    }),
  });
  await app.register(jwt, { secret: deps.config.JWT_SECRET });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
  await app.register(rawBody, { global: false, encoding: 'utf8', runFirst: true });

  registerAppVersionGate(app, deps.config.MIN_APP_VERSION);
  registerGuards(app, deps);
  registerIdempotency(app, deps);

  if (deps.providers.storage instanceof MemoryStorage) deps.providers.storage.routes(app);

  // Every answer names its request, so a person reporting a problem can quote it, and says how long
  // the server spent on it, so the app can tell the server's time from the network's.
  app.addHook('onSend', async (req, reply) => {
    void reply.header('x-request-id', req.id);
    void reply.header('server-timing', `app;dur=${reply.elapsedTime.toFixed(1)}`);
  });

  app.get('/health', async () => {
    await deps.pool.query('select 1');
    return { ok: true };
  });

  // How far behind the background jobs are: 503 when the oldest due job has waited over 15 minutes,
  // which means no worker is taking them (for an alert on the worker, or on the API running inline).
  app.get('/health/worker', async (_req, reply) => {
    const { rows } = await deps.pool.query<{ waiting: number | null; dead: number }>(
      `select extract(epoch from (now() - min(run_at)))::int as waiting,
              (select count(*)::int from jobs where status = 'dead' and finished_at > now() - interval '1 day') as dead
       from jobs where status = 'queued' and run_at <= now()`,
    );
    const waiting = rows[0]?.waiting ?? 0;
    const dead = rows[0]?.dead ?? 0;
    return reply.status(waiting > 900 ? 503 : 200).send({ ok: waiting <= 900, oldestDueSeconds: waiting, deadLastDay: dead });
  });

  // Lixi's tools over MCP; outside the contract, like /health.
  registerMcp(app, deps);
  // The pages behind the share links customers are sent.
  registerSharePages(app, deps);

  const { operations } = await loadOperations();
  registerRoutes(app, deps, operations, opts.handlers ?? defaultHandlers, opts.webhooks ?? defaultWebhooks);

  return app;
}
