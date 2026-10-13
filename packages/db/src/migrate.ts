import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb, createPool } from './index';
import { seedReference } from './reference';
import { seedDemoFromEnv } from './seed';

export const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

/**
 * Applies migrations and reference data, then the demo account when
 * SEED_DEMO_ACCOUNT=true (a no-op if it already exists). Returns what the
 * demo seed did, for the log.
 */
export async function runMigrations(url: string, env: Record<string, string | undefined> = process.env): Promise<string> {
  const pool = createPool(url, 1);
  try {
    const db = createDb(pool);
    await migrate(db, { migrationsFolder });
    // Reference data belongs with the schema: every environment needs it.
    await seedReference(db);
    return await seedDemoFromEnv(db, { env });
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL ?? 'postgres://esmart:esmart@localhost:5432/esmart';
  const demo = await runMigrations(url);
  console.log('Migrations and reference data applied.');
  console.log(demo);
}
