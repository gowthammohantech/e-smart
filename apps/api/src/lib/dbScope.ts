import { AsyncLocalStorage } from 'node:async_hooks';
import { bypassesRls, createDb, createPool, createScopedPool, type Db } from '@esmart/db';
import type pg from 'pg';
import type { Config } from '../config';

/**
 * The companies the current request may touch, for row-level security
 * (docs/database/rls.md). The request pool reads it on every connection
 * checkout and hands it to Postgres as `app.company_ids`; outside a scope the
 * request role sees no company rows at all.
 */
const scope = new AsyncLocalStorage<readonly string[]>();

export function currentCompanyIds(): readonly string[] | undefined {
  return scope.getStore();
}

/** Runs `fn` (and everything it awaits) as able to see only these companies. */
export function withCompanies<T>(companyIds: readonly string[], fn: () => T): T {
  return scope.run(companyIds, fn);
}

export type Databases = {
  /** API requests: row-level security applies, scoped by withCompanies. */
  pool: pg.Pool;
  db: Db;
  /** Work across companies (jobs, webhooks, platform, sign-in): BYPASSRLS. */
  systemPool: pg.Pool;
  systemDb: Db;
};

export function openDatabases(config: Pick<Config, 'DATABASE_URL' | 'SYSTEM_DATABASE_URL'>, opts: { max?: number; systemMax?: number } = {}): Databases {
  const pool = createScopedPool(config.DATABASE_URL, currentCompanyIds, opts.max ?? 10);
  const systemPool = createPool(config.SYSTEM_DATABASE_URL || config.DATABASE_URL, opts.systemMax ?? 5);
  return { pool, db: createDb(pool), systemPool, systemDb: createDb(systemPool) };
}

/**
 * With RLS_ENFORCE on, the request role must not skip row-level security, or
 * the policies protect nothing. Off, it only warns, so a deployment can switch
 * DATABASE_URL over to `esmart_app` when it is ready.
 */
export async function checkRequestRole(pool: pg.Pool, config: Pick<Config, 'RLS_ENFORCE' | 'NODE_ENV'>, log: { warn: (msg: string) => void }): Promise<void> {
  if (!(await bypassesRls(pool))) return;
  const msg = 'DATABASE_URL connects as a role that bypasses row-level security (superuser or BYPASSRLS); point it at esmart_app.';
  if (config.RLS_ENFORCE) throw new Error(msg);
  if (config.NODE_ENV === 'production') log.warn(msg);
}

/**
 * The same deps with the system database as `db`: for code that spans companies by design (the
 * worker's jobs, webhooks, the platform console), so its helpers need no changes.
 */
export function asSystem<D extends { db: Db; pool: pg.Pool; systemDb: Db; systemPool: pg.Pool }>(deps: D): D {
  return { ...deps, db: deps.systemDb, pool: deps.systemPool };
}
