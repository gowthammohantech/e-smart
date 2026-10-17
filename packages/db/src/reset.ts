import { createPool } from './index';

/** Drops and recreates the public schema. Development only. */
export async function resetDatabase(url: string): Promise<void> {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to reset a production database.');
  const pool = createPool(url, 1);
  try {
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;');
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await resetDatabase(process.env.DATABASE_URL ?? 'postgres://esmart:esmart@localhost:5432/esmart');
  console.log('Database reset.');
}
