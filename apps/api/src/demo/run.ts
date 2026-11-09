/**
 * Builds (or refreshes) the public demo account by hand:
 *   npm run demo:seed -w @esmart/api [-- --force]
 * The API does the same on its own at start-up and once a day.
 */
import { createDb, createPool } from '@esmart/db';
import { loadConfig } from '../config';
import { createProviders } from '../providers';
import { ensurePublicDemo } from './seed';

const config = loadConfig();
const pool = createPool(config.DATABASE_URL, 4);
const db = createDb(pool);
const providers = createProviders(config, console, db);
const log = {
  info: (o: object | string, m?: string) => console.log(m ?? '', typeof o === 'string' ? o : JSON.stringify(o)),
  warn: (o: object | string, m?: string) => console.warn(m ?? '', typeof o === 'string' ? o : JSON.stringify(o)),
  error: (o: object | string, m?: string) => console.error(m ?? '', o),
};
try {
  const outcome = await ensurePublicDemo({ db, pool, config, providers, now: () => new Date() }, log, { force: process.argv.includes('--force') });
  console.log(`Demo account: ${outcome}`);
} finally {
  await pool.end();
}
