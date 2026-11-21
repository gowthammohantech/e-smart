import { and, asc, desc, gt, lt, not, or, eq, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { badRequest } from './errors';

export type Page<T> = { data: T[]; nextCursor: string | null };

type CursorValue = string | number;

export function encode(values: CursorValue[]): string {
  return Buffer.from(JSON.stringify(values)).toString('base64url');
}

export function decode(cursor: string): CursorValue[] {
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

/**
 * Keyset over a search by name: the names that start with what was typed first, then the others that
 * hold it, each in name order (then id). "k" lists Kumar and Kavya before Ankit and Mukesh. Without
 * a search it is the plain name order of `keyset`. The cursor carries which of the two it stopped in.
 */
export function nameSearchKeyset(opts: { cursor?: string | null; limit?: number | null; q?: string | null; name: PgColumn; id: PgColumn }) {
  const q = opts.q?.trim();
  if (!q) return keyset({ cursor: opts.cursor, limit: opts.limit, sort: opts.name, id: opts.id, order: 'asc' });
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  // What was typed, taken literally: % and _ match themselves.
  const prefix = `${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const starts = sql`${opts.name} ilike ${prefix}`;
  const group = sql`case when ${opts.name} ilike ${prefix} then 0 else 1 end`;
  let where: SQL | undefined;
  if (opts.cursor) {
    const [g, name, id] = decode(opts.cursor);
    const after = or(gt(opts.name, name), and(eq(opts.name, name), gt(opts.id, id)))!;
    where = g === 0 ? or(and(starts, after), not(starts)) : and(not(starts), after);
  }
  const nameKey = jsKey(opts.name);
  return {
    where,
    orderBy: [asc(group), asc(opts.name), asc(opts.id)],
    take: limit + 1,
    page<W>(mapped: W[], rows: Record<string, unknown>[]): Page<W> {
      if (rows.length <= limit) return { data: mapped, nextCursor: null };
      const last = rows[limit - 1];
      const name = String(last[nameKey]);
      const g = name.toLowerCase().startsWith(q.toLowerCase()) ? 0 : 1;
      return { data: mapped.slice(0, limit), nextCursor: encode([g, name, last.id as CursorValue]) };
    },
  };
}

/**
 * The same paging over rows already read and sorted newest first by `key` (a list drawn from more
 * than one table): the cursor is the last row's key, as keyset() writes it.
 */
export function pageInMemory<T>(rows: T[], opts: { cursor?: string | null; limit?: number | null; key: (row: T) => [string, string] }): Page<T> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  let from = rows;
  if (opts.cursor) {
    const [d, id] = decode(opts.cursor).map(String);
    from = rows.filter((r) => {
      const [rd, rid] = opts.key(r);
      return rd < d || (rd === d && rid < id);
    });
  }
  if (from.length <= limit) return { data: from, nextCursor: null };
  const page = from.slice(0, limit);
  return { data: page, nextCursor: encode(opts.key(page[limit - 1])) };
}
