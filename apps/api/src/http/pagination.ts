import { and, asc, desc, gt, lt, or, eq, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { badRequest } from './errors';

export type Page<T> = { data: T[]; nextCursor: string | null };

type CursorValue = string | number;

function encode(values: CursorValue[]): string {
  return Buffer.from(JSON.stringify(values)).toString('base64url');
}

function decode(cursor: string): CursorValue[] {
  try {
    const v = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (Array.isArray(v)) return v;
  } catch {
    // fall through
  }
  throw badRequest('INVALID_CURSOR', 'The cursor is not one this API issued');
}

const jsKey = (c: PgColumn) => c.name.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase());

/**
 * Keyset pagination over `(sort, then?, id)`: stable under inserts, no OFFSET. `then` breaks ties in
 * `sort` before the id does (documents of one day by their number), in the same direction.
 *
 *   const k = keyset({ cursor, limit, sort: documents.date, id: documents.id, order: 'desc' });
 *   const rows = await db.select().from(documents).where(and(filters, k.where)).orderBy(...k.orderBy).limit(k.take);
 *   return k.page(rows.map(toWire), rows);
 */
export function keyset(opts: {
  cursor?: string | null;
  limit?: number | null;
  sort: PgColumn;
  then?: PgColumn;
  id: PgColumn;
  order?: 'asc' | 'desc';
  /** How to read the sort value off a row; defaults to the column's JS key. */
  sortKey?: string;
  idKey?: string;
}) {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const order = opts.order ?? 'desc';
  const cmp = order === 'desc' ? lt : gt;
  const dir = order === 'desc' ? desc : asc;
  const value = (c: PgColumn, v: CursorValue) => (c.columnType === 'PgTimestamp' ? new Date(String(v)) : v);
  let where: SQL | undefined;
  if (opts.cursor) {
    const values = decode(opts.cursor);
    if (opts.then && values.length === 3) {
      const [s, t, id] = values;
      const sv = value(opts.sort, s);
      const tv = value(opts.then, t);
      where = or(cmp(opts.sort, sv), and(eq(opts.sort, sv), or(cmp(opts.then, tv), and(eq(opts.then, tv), cmp(opts.id, id)))));
    } else {
      const [s, id] = values;
      const sv = value(opts.sort, s);
      where = or(cmp(opts.sort, sv), and(eq(opts.sort, sv), cmp(opts.id, id)));
    }
  }
  const sortKey = opts.sortKey ?? jsKey(opts.sort);
  const idKey = opts.idKey ?? 'id';
  const cursorValue = (v: unknown) => (v instanceof Date ? v.toISOString() : (v as CursorValue));
  return {
    where,
    orderBy: opts.then ? [dir(opts.sort), dir(opts.then), dir(opts.id)] : [dir(opts.sort), dir(opts.id)],
    /** One extra row tells us whether there is a next page. */
    take: limit + 1,
    page<W>(mapped: W[], rows: Record<string, unknown>[]): Page<W> {
      if (rows.length <= limit) return { data: mapped, nextCursor: null };
      const last = rows[limit - 1];
      const values = [cursorValue(last[sortKey]), ...(opts.then ? [cursorValue(last[jsKey(opts.then)])] : []), last[idKey] as CursorValue];
      return { data: mapped.slice(0, limit), nextCursor: encode(values) };
    },
  };
}
