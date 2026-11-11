import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';
import * as relations from './relations';

export { schema };
export const fullSchema = { ...schema, ...relations };
export type Db = NodePgDatabase<typeof fullSchema>;

// Postgres `date` columns come back as 'YYYY-MM-DD' strings rather than JS
// Dates, which would shift by the server's time zone. `numeric` stays a
// string too (pg's default), so rates and quantities never round-trip a float.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);
// int8 (bigint, bigserial, count(*)) as a JS number: minor units stay far
// below 2^53, and a string would leak into every sum.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

// pg drops idle connections after 10s by default, so the first request after
// a quiet spell pays a fresh TCP + TLS + auth handshake to a remote database.
// Keep them for five minutes, and keep TCP alive so they survive NAT idling.
export function createPool(url: string, max = 10): pg.Pool {
  return new pg.Pool({ connectionString: url, max, idleTimeoutMillis: 300_000, keepAlive: true });
}

/**
 * The companies a connection may see, as a Postgres text[] literal ('{"cmp_a","cmp_b"}').
 * The row-level security policies (migration 0060) read it through `app_company_ids()`.
 */
export function companyIdsLiteral(ids: readonly string[]): string {
  return `{${ids.map((id) => `"${id.replace(/[\\"]/g, (c) => `\\${c}`)}"`).join(',')}}`;
}

type ScopedClient = pg.PoolClient & { __companyIds?: string };

/**
 * A pool for a role under row-level security. Every checkout first sets
 * `app.company_ids` to the caller's scope, read when `connect()` is called, so
 * it follows the request through AsyncLocalStorage. With no scope it sets '{}':
 * a connection never keeps the companies of whoever used it before, and code
 * without a scope sees no company rows at all.
 *
 * `pool.query` and Drizzle's transactions both check out through `connect()`.
 * The value is cached on the connection, so an unchanged scope costs nothing.
 */
export class ScopedPool extends pg.Pool {
  constructor(
    config: pg.PoolConfig,
    private readonly scope: () => readonly string[] | undefined,
  ) {
    super(config);
  }

  override connect(): Promise<pg.PoolClient>;
  override connect(callback: (err: Error | undefined, client: pg.PoolClient | undefined, done: (release?: unknown) => void) => void): void;
  override connect(callback?: (err: Error | undefined, client: pg.PoolClient | undefined, done: (release?: unknown) => void) => void): Promise<pg.PoolClient> | void {
    const value = companyIdsLiteral(this.scope() ?? []);
    const ready = super.connect().then(async (client: ScopedClient) => {
      if (client.__companyIds === value) return client;
      try {
        // Session-level (not SET LOCAL): it is set outside any transaction, so it holds for every
        // statement on this checkout, and the next checkout sets it again.
        await client.query("select set_config('app.company_ids', $1, false)", [value]);
      } catch (err) {
        client.release(err as Error);
        throw err;
      }
      client.__companyIds = value;
      return client;
    });
    if (!callback) return ready;
    ready.then(
      (client) => callback(undefined, client, (release) => client.release(release as Error | boolean | undefined)),
      (err: Error) => callback(err, undefined, () => {}),
    );
  }
}

/** A pool whose connections see only the scope's companies (see ScopedPool). */
export function createScopedPool(url: string, scope: () => readonly string[] | undefined, max = 10): ScopedPool {
  return new ScopedPool({ connectionString: url, max, idleTimeoutMillis: 300_000, keepAlive: true }, scope);
}

/** Whether the role behind this pool skips row-level security (superuser or BYPASSRLS). */
export async function bypassesRls(pool: pg.Pool): Promise<boolean> {
  const { rows } = await pool.query<{ bypass: boolean }>('select (rolsuper or rolbypassrls) as bypass from pg_roles where rolname = current_user');
  return rows[0]?.bypass ?? true;
}

export function createDb(pool: pg.Pool): Db {
  return drizzle(pool, { schema: fullSchema });
}
