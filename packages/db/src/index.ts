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

export function createPool(url: string, max = 10): pg.Pool {
  return new pg.Pool({ connectionString: url, max });
}

export function createDb(pool: pg.Pool): Db {
  return drizzle(pool, { schema: fullSchema });
}
