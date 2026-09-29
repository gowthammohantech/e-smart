import pg from 'pg';
import { runMigrations } from '@esmart/db/migrate';

/**
 * Recreates the test database and migrates it once per run. Set
 * TEST_DATABASE_URL to use another database (parallel runs need their own).
 */
export default async function setup() {
  const url = new URL(process.env.TEST_DATABASE_URL ?? 'postgres://esmart:esmart@localhost:5432/esmart_test');
  const name = url.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await client.query(`CREATE DATABASE "${name}"`);
  await client.end();
  await runMigrations(url.toString());
  process.env.TEST_DATABASE_URL = url.toString();
}
