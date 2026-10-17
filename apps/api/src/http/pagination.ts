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

/**
 * Keyset pagination over `(sort, id)`: stable under inserts, no OFFSET.
 *
 *   const k = keyset({ cursor, limit, sort: documents.date, id: documents.id, order: 'desc' });
 *   const rows = await db.select().from(documents).where(and(filters, k.where)).orderBy(...k.orderBy).limit(k.take);
 *   return k.page(rows.map(toWire), rows);
 */
export function keyset(opts: {
  cursor?: string | null;
  limit?: number | null;
  sort: PgColumn;
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
  let where: SQL | undefined;
  if (opts.cursor) {
    const [s, id] = decode(opts.cursor);
    const sortVal = opts.sort.columnType === 'PgTimestamp' ? new Date(String(s)) : s;
    where = or(cmp(opts.sort, sortVal), and(eq(opts.sort, sortVal), cmp(opts.id, id)));
  }
  const sortKey = opts.sortKey ?? opts.sort.name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  const idKey = opts.idKey ?? 'id';
  return {
    where,
    orderBy: [dir(opts.sort), dir(opts.id)],
    /** One extra row tells us whether there is a next page. */
    take: limit + 1,
    page<W>(mapped: W[], rows: Record<string, unknown>[]): Page<W> {
      if (rows.length <= limit) return { data: mapped, nextCursor: null };
      const last = rows[limit - 1];
      const s = last[sortKey];
      return {
        data: mapped.slice(0, limit),
        nextCursor: encode([s instanceof Date ? s.toISOString() : (s as CursorValue), last[idKey] as CursorValue]),
      };
    },
  };
}
