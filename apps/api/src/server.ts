import { createDb, createPool } from '@esmart/db';
import { buildApp } from './app';
import { loadConfig } from './config';
import { purgeIdempotencyKeys } from './http/idempotency';
import { createProviders } from './providers';

const config = loadConfig();
const pool = createPool(config.DATABASE_URL);
const providers = createProviders(config, console);
const deps = { db: createDb(pool), pool, config, providers, now: () => new Date() };
const app = await buildApp(deps);

const purge = setInterval(() => void purgeIdempotencyKeys(deps).catch((err) => app.log.warn({ err }, 'idempotency purge failed')), 3_600_000);

async function shutdown(signal: string) {
  app.log.info(`${signal}: shutting down`);
  clearInterval(purge);
  await app.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: config.HOST, port: config.PORT });
