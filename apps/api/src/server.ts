import { createDb, createPool } from '@esmart/db';
import { buildApp } from './app';
import { loadConfig } from './config';
import { purgeIdempotencyKeys } from './http/idempotency';
import { reconcileEInvoices } from './modules/compliance/einvoice';
import { createProviders } from './providers';
import { reportError } from './lib/reporter';

const config = loadConfig();
const pool = createPool(config.DATABASE_URL);
const db = createDb(pool);
const providers = createProviders(config, console, db);
const deps = { db, pool, config, providers, now: () => new Date() };
const app = await buildApp(deps);

const purge = setInterval(() => void purgeIdempotencyKeys(deps).catch((err) => app.log.warn({ err }, 'idempotency purge failed')), 3_600_000);

const reconcile = setInterval(() => void reconcileEInvoices(deps).catch((err) => app.log.warn({ err }, 'e-invoice reconcile failed')), 5 * 60_000);

async function shutdown(signal: string) {
  app.log.info(`${signal}: shutting down`);
  clearInterval(purge);
  clearInterval(reconcile);
  await app.close();
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

await app.listen({ host: config.HOST, port: config.PORT });
