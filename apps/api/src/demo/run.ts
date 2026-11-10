/**
 * Builds (or refreshes) the public demo account by hand:
 *   npm run demo:seed -w @esmart/api [-- --force]
 * The API does the same on its own at start-up and once a day.
 */
import { loadConfig } from '../config';
import { asSystem, openDatabases } from '../lib/dbScope';
import { createProviders } from '../providers';
import { ensurePublicDemo } from './seed';

const config = loadConfig();
const dbs = openDatabases(config, { max: 4, systemMax: 4 });
const providers = createProviders(config, console, dbs.systemDb);
const log = {
  info: (o: object | string, m?: string) => console.log(m ?? '', typeof o === 'string' ? o : JSON.stringify(o)),
  warn: (o: object | string, m?: string) => console.warn(m ?? '', typeof o === 'string' ? o : JSON.stringify(o)),
  error: (o: object | string, m?: string) => console.error(m ?? '', o),
};
try {
  const outcome = await ensurePublicDemo(asSystem({ ...dbs, config, providers, now: () => new Date() }), log, { force: process.argv.includes('--force') });
  console.log(`Demo account: ${outcome}`);
} finally {
  await Promise.all([dbs.pool.end(), dbs.systemPool.end()]);
}
