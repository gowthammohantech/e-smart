import { createDb, createPool } from '@esmart/db';
import { buildApp } from './app';
import { loadConfig } from './config';
import { startBackground } from './jobs';
import { createProviders } from './providers';
import { reportError, setErrorReporter } from './lib/reporter';

const config = loadConfig();
const pool = createPool(config.DATABASE_URL);
const db = createDb(pool);
const providers = createProviders(config, console, db);
const deps = { db, pool, config, providers, now: () => new Date() };
const app = await buildApp(deps);

// Crashes and 500s also go to PostHog error tracking, anonymously: the error, the route and the
// request id (to find it in the logs), never who sent it or the request body.
setErrorReporter((err, ctx) => {
  const where = Object.fromEntries(Object.entries({ requestId: ctx.requestId, route: ctx.route, job: ctx.source, fatal: ctx.fatal }).filter(([, v]) => v !== undefined));
  providers.analytics.captureException(err, undefined, { source: 'api', ...where });
});

// Scheduled work and queued jobs (apps/api/src/jobs), unless a separate worker service does them.
const stopBackground = config.WORKER === 'off' ? async () => {} : startBackground(deps, app.log, { concurrency: config.WORKER_CONCURRENCY });

async function shutdown(signal: string) {
  app.log.info(`${signal}: shutting down`);
  // Running jobs finish (or go back to the queue) before the database closes.
  await stopBackground();
  await app.close();
  // Events still queued for PostHog go out before the process ends.
  await providers.analytics.shutdown().catch(() => {});
  await pool.end();
  process.exit(0);
}
// A promise nobody awaited: log it and carry on, as one failed background task shouldn't stop the API.
process.on('unhandledRejection', (err) => reportError(app.log, err));
// The process may be in any state now. Stop taking requests, give the open ones 10 seconds, and exit
// non-zero so Railway starts a fresh one.
process.on('uncaughtException', (err) => {
  reportError(app.log, err, { fatal: true });
  setTimeout(() => process.exit(1), 10_000).unref();
  void app.close().finally(() => process.exit(1));
});
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

// A worker-only process still answers /health, so Railway can check it, but serves nothing else.
if (config.WORKER === 'only') {
  const { createServer } = await import('node:http');
  createServer((req, res) => {
    if (req.url !== '/health') return void res.writeHead(404).end();
    pool.query('select 1').then(
      () => res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true,"role":"worker"}'),
      () => res.writeHead(503).end(),
    );
  }).listen(config.PORT, config.HOST);
  app.log.info('worker only: serving /health, running jobs');
} else {
  await app.listen({ host: config.HOST, port: config.PORT });
}
