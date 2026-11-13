import pg from 'pg';
import { runDirectly } from './runDirectly';

/**
 * The two login roles the API uses, next to the owner that runs migrations
 * (docs/database/rls.md):
 *
 * - `esmart_app`: every API request. Row-level security applies, so it sees
 *   only the companies the request set in `app.company_ids`.
 * - `esmart_system`: the worker's jobs, webhooks, the platform console, sign-in
 *   and other work that spans companies. BYPASSRLS, by explicit choice in code.
 *
 * Neither owns a table, and neither can change the schema. Run after every
 * migrate (`npm run db:roles`): it is idempotent, it grants on tables added
 * since, and a restore with `--no-privileges` needs the grants again.
 */
export const APP_ROLE = 'esmart_app';
export const SYSTEM_ROLE = 'esmart_system';

type RoleSpec = { name: string; bypassRls: boolean; password: string | undefined };

/** A local database gets the role name as a password, so dev and tests need no setup. */
function isLocal(url: string): boolean {
  try {
    return ['localhost', '127.0.0.1', 'postgres', '::1'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export async function applyRoles(url: string, env: Record<string, string | undefined> = process.env): Promise<string[]> {
  const local = isLocal(url);
  const roles: RoleSpec[] = [
    { name: APP_ROLE, bypassRls: false, password: env.APP_DB_PASSWORD || (local ? APP_ROLE : undefined) },
    { name: SYSTEM_ROLE, bypassRls: true, password: env.SYSTEM_DB_PASSWORD || (local ? SYSTEM_ROLE : undefined) },
  ];
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const done: string[] = [];
  try {
    for (const role of roles) {
      const { rowCount } = await client.query('select 1 from pg_roles where rolname = $1', [role.name]);
      const attrs = `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT ${role.bypassRls ? 'BYPASSRLS' : 'NOBYPASSRLS'}`;
      await client.query(`${rowCount ? 'ALTER' : 'CREATE'} ROLE ${role.name} ${attrs}`);
      // Without a password the role exists and holds its grants, but can't sign in yet.
      if (role.password) await client.query(`ALTER ROLE ${role.name} PASSWORD ${quoteLiteral(role.password)}`);
      done.push(`${role.name}: ${rowCount ? 'updated' : 'created'}${role.password ? '' : ' (no password set: APP_DB_PASSWORD / SYSTEM_DB_PASSWORD)'}`);

      // Data only: no TRUNCATE, no DDL, no ownership.
      await client.query(`GRANT USAGE ON SCHEMA public TO ${role.name}`);
      await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role.name}`);
      await client.query(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${role.name}`);
      await client.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ${role.name}`);
      // Tables the owner creates later are covered before this script runs again.
      await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role.name}`);
      await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${role.name}`);
      await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO ${role.name}`);
    }
    // The nightly pg_dump runs as the system role and reads the migration journal too.
    const { rowCount: hasDrizzle } = await client.query("select 1 from pg_namespace where nspname = 'drizzle'");
    if (hasDrizzle) {
      await client.query(`GRANT USAGE ON SCHEMA drizzle TO ${SYSTEM_ROLE}`);
      await client.query(`GRANT SELECT ON ALL TABLES IN SCHEMA drizzle TO ${SYSTEM_ROLE}`);
      await client.query(`GRANT SELECT ON ALL SEQUENCES IN SCHEMA drizzle TO ${SYSTEM_ROLE}`);
    }
  } finally {
    await client.end();
  }
  return done;
}

if (runDirectly(import.meta.url)) {
  const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL || 'postgres://esmart:esmart@localhost:5432/esmart';
  for (const line of await applyRoles(url)) console.log(line);
}
