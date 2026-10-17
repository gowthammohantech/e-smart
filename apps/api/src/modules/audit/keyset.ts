import { and, desc, eq, lt, or, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { badRequest } from '../../http/errors';

/**
 * Newest-first keyset pagination over `(timestamp, id)`, at the database's
 * microsecond precision. The shared `keyset` carries timestamps through a JS
 * Date (milliseconds), which skips rows that share a millisecond with the
 * page boundary; `now()` defaults make that common for audit rows and
 * notifications written in one transaction.
 */
export function newestFirst(opts: { cursor?: string | null; limit?: number | null; at: PgColumn; id: PgColumn }) {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  let where: SQL | undefined;
  if (opts.cursor) {
    let at: string;
    let id: string;
    try {
      [at, id] = JSON.parse(Buffer.from(opts.cursor, 'base64url').toString('utf8')) as [string, string];
    } catch {
      throw badRequest('INVALID_CURSOR', 'The cursor is not one this API issued');
    }
    if (typeof at !== 'string' || typeof id !== 'string' || Number.isNaN(Date.parse(at))) {
      throw badRequest('INVALID_CURSOR', 'The cursor is not one this API issued');
    }
    const ts = sql`${at}::timestamptz`;
    where = or(lt(opts.at, ts), and(eq(opts.at, ts), lt(opts.id, id)));
  }
  return {
    where,
    orderBy: [desc(opts.at), desc(opts.id)],
    take: limit + 1,
    /** Select this alongside the row: the timestamp in full precision, as text. */
    cursorColumn: sql<string>`to_char(${opts.at} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    page<W>(mapped: W[], rows: { cursorAt: string; id: string }[]) {
      if (rows.length <= limit) return { data: mapped, nextCursor: null };
      const last = rows[limit - 1];
      return {
        data: mapped.slice(0, limit),
        nextCursor: Buffer.from(JSON.stringify([last.cursorAt, last.id])).toString('base64url'),
      };
    },
  };
}
