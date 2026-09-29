import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb, createPool } from './index';
import { seedReference } from './reference';

export const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

export async function runMigrations(url: string): Promise<void> {
  const pool = createPool(url, 1);
  try {
    const db = createDb(pool);
    await migrate(db, { migrationsFolder });
    // Reference data belongs with the schema: every environment needs it.
    await seedReference(db);
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL ?? 'postgres://esmart:esmart@localhost:5432/esmart';
  await runMigrations(url);
  console.log('Migrations and reference data applied.');
}
