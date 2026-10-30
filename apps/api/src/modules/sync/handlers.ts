import { and, eq, inArray, sql } from 'drizzle-orm';
import { schema } from '@esmart/db';
import type { Schema } from '@esmart/api-contract';
import { defineHandlers } from '../../context';
import { ApiError, badRequest, forbidden } from '../../http/errors';
import { sha256 } from '../../lib/crypto';
import { compact } from '../../lib/wire';
import { injectAs } from '../../lib/internal';
import { fetchEntities } from './entities';

const CL = schema.changeLog;
const SM = schema.syncMutations;
const MAP = schema.clientIdMappings;

type Mutation = Schema<'SyncMutation'>;
type Problem = Schema<'Problem'>;
/** The contract types a free-form `{ type: object }` as `Record<string, never>`. */
type Json = Record<string, never>;
type Result = { id: string; status: 'applied' | 'conflict' | 'rejected' | 'retry'; entity?: Json; error?: Problem };

/** A claim older than this belongs to a request that died, not one still running. */
const CLAIM_TTL_MS = 5 * 60_000;

/** Answers that say nothing about the change itself: it should simply be sent again. */
const isTransient = (status: number, body?: Json) =>
  status >= 500 || status === 401 || status === 408 || status === 429 || (status === 409 && (body as Problem | undefined)?.code === 'IDEMPOTENT_REQUEST_IN_PROGRESS');

/** Where to read back what a POST creates: `…/parties`, or `…/documents` for a convert or duplicate. */
const collectionOf = (path: string) => path.split('?')[0].replace(/(\/documents)\/[^/]+\/(convert|duplicate)$/, '$1');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The Idempotency-Key for a queue entry: its id if it is a UUID, else one derived from it. */
function idempotencyKeyFor(id: string): string {
  if (UUID.test(id)) return id;
  const h = sha256(`sync:${id}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** `/companies/c/tax-categories` → `tax_category`: the entity a POST creates. */
function entityTypeOf(path: string): string {
  const segment = path.split('?')[0].split('/').filter(Boolean).pop() ?? 'entity';
  const s = segment.replace(/-/g, '_');
  if (s.endsWith('series')) return s;
  if (s.endsWith('ies')) return `${s.slice(0, -3)}y`;
  if (/(ches|shes|sses|xes)$/.test(s)) return s.slice(0, -2);
  return s.endsWith('s') ? s.slice(0, -1) : s;
}

/** Replaces every string that is exactly a known offline id, anywhere in the value. */
function rewriteIds(value: unknown, ids: Map<string, string>): unknown {
  if (typeof value === 'string') return ids.get(value) ?? value;
  if (Array.isArray(value)) return value.map((v) => rewriteIds(v, ids));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewriteIds(v, ids)]));
  }
  return value;
}

function rewritePath(path: string, ids: Map<string, string>): string {
  const [p, q] = path.split('?');
  const out = p
    .split('/')
    .map((seg) => {
      const decoded = decodeURIComponent(seg);
      const mapped = ids.get(decoded);
      return mapped ? encodeURIComponent(mapped) : seg;
    })
    .join('/');
  return q === undefined ? out : `${out}?${q}`;
}

const problem = (status: number, code: string, detail: string): Problem => ({ type: 'about:blank', title: 'Rejected', status, code, detail });

const asObject = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : undefined);

/** Sync: syncPush, syncPull. */
export const syncHandlers = defineHandlers({
  /**
   * Replays the offline queue in order through the real routes, as the
   * caller: validation, guards, plan gating, idempotency and If-Match all
   * apply exactly as online. Offline ids in paths and bodies are swapped for
   * server ids first, including ids created earlier in the same batch.
   */
  async syncPush(ctx) {
    const server = ctx.req.server;
    const auth = ctx.req.headers.authorization;
    const userId = ctx.user.id;
    const mappings = await ctx.db.select().from(MAP).where(eq(MAP.userId, userId));
    const ids = new Map(mappings.map((m) => [m.clientEntityId, m.serverEntityId]));
    const accountCompanies = new Set(
      (await ctx.db.select({ id: schema.companies.id }).from(schema.companies).where(eq(schema.companies.accountId, ctx.user.accountId))).map((r) => r.id),
    );
    const results: Result[] = [];

    for (const m of ctx.body.mutations as Mutation[]) {
      let path = rewritePath(m.path.startsWith('/') ? m.path : `/${m.path}`, ids);
      if (path.startsWith('/v1/')) path = path.slice(3);
      const companyId = /^\/companies\/([^/?]+)/.exec(path)?.[1];
      const row = {
        id: m.id,
        userId,
        companyId: companyId && accountCompanies.has(decodeURIComponent(companyId)) ? decodeURIComponent(companyId) : null,
        deviceSessionId: ctx.user.sessionId,
        method: m.method,
        path: path.slice(0, 300),
        body: m.body ?? null,
        baseVersion: m.baseVersion ?? null,
        clientEntityId: m.clientEntityId ?? null,
        queuedAt: new Date(m.queuedAt),
        appliedAt: ctx.now,
      };
      // Claimed before it runs, so two pushes of one entry can't both run it. No result yet means
      // claimed; the status is only a placeholder, one that a dead claim can't be mistaken by.
      const claimed = await ctx.db.insert(SM).values({ ...row, status: 'rejected' }).onConflictDoNothing().returning({ id: SM.id });
      if (!claimed.length) {
        const [seen] = await ctx.db.select().from(SM).where(eq(SM.id, m.id));
        if (seen.userId !== userId) {
          results.push({ id: m.id, status: 'rejected', error: problem(409, 'MUTATION_ID_TAKEN', 'This queue entry id was already used') });
          continue;
        }
        if (seen.result) {
          // A resend of an entry already applied: report what happened then.
          results.push({ id: m.id, ...(seen.result as Omit<Result, 'id'>) } as Result);
          continue;
        }
        if (ctx.now.getTime() - seen.appliedAt.getTime() < CLAIM_TTL_MS) {
          results.push({ id: m.id, status: 'retry', error: problem(409, 'MUTATION_IN_PROGRESS', 'This change is still being applied') });
          continue;
        }
        await ctx.db.update(SM).set({ appliedAt: ctx.now }).where(eq(SM.id, m.id));
      }

      let result: Omit<Result, 'id'>;
      let record = true;
      const known = m.method === 'POST' && m.clientEntityId ? ids.get(m.clientEntityId) : undefined;
      if (/^\/(sync|auth|invites)\//.test(path)) {
        result = { status: 'rejected', error: problem(400, 'UNSUPPORTED_MUTATION', `${m.method} ${path} cannot be queued offline`) };
      } else if (known) {
        // Already created, under another queue entry (a retry): hand back that one, don't make a second.
        const current = await injectAs(server, auth, { method: 'GET', url: `/v1${collectionOf(path)}/${encodeURIComponent(known)}` });
        result = { status: 'applied', entity: current.status === 200 ? asObject(current.body) : ({ id: known } as unknown as Json) };
      } else {
        const headers: Record<string, string> = {};
        if (m.method === 'POST') headers['idempotency-key'] = idempotencyKeyFor(m.id);
        if (m.baseVersion !== undefined) headers['if-match'] = `"v${m.baseVersion}"`;
        const payload = m.body === undefined ? (m.method === 'POST' ? {} : undefined) : rewriteIds(m.body, ids);
        const res = await injectAs(server, auth, { method: m.method, url: `/v1${path}`, payload, headers });
        const body = asObject(res.body);
        if (res.status < 300) {
          result = compact({ status: 'applied' as const, entity: body });
          const serverId = body?.id;
          if (m.clientEntityId && m.method === 'POST' && typeof serverId === 'string') {
            ids.set(m.clientEntityId, serverId);
            await ctx.db
              .insert(MAP)
              .values({ clientEntityId: m.clientEntityId, userId, entityType: entityTypeOf(path), serverEntityId: serverId })
              .onConflictDoUpdate({ target: [MAP.userId, MAP.clientEntityId], set: { serverEntityId: serverId } });
          }
        } else if (res.status === 412) {
          // Hand back the server copy so the client can show both and choose.
          const current = m.method === 'POST' ? undefined : await injectAs(server, auth, { method: 'GET', url: `/v1${path}` });
          result = compact({ status: 'conflict' as const, entity: current?.status === 200 ? asObject(current.body) : undefined, error: body as Problem | undefined });
        } else {
          const error = (body as Problem | undefined) ?? problem(res.status, 'REJECTED', `The server answered ${res.status}`);
          // Not an outcome: leave it unrecorded so a resend runs again.
          record = !isTransient(res.status, body);
          result = { status: record ? 'rejected' : 'retry', error };
        }
      }

      if (record) await ctx.db.update(SM).set({ status: result.status as 'applied' | 'conflict' | 'rejected', result, appliedAt: ctx.now }).where(eq(SM.id, m.id));
      else await ctx.db.delete(SM).where(eq(SM.id, m.id));
      results.push({ id: m.id, ...result });
    }
    return { results };
  },

  /**
   * Pages the change log. Without `since` it is a snapshot: the latest change
   * of every live entity. With `since`, every change after that cursor; within
   * one page, repeated changes to an entity collapse to the latest. `data` is
   * what the entity's own GET returns now; deletes carry none.
   */
  async syncPull(ctx) {
    const { since, companyId } = ctx.query;
    const limit = Math.min(Math.max(ctx.query.limit ?? 500, 1), 2000);
    let companies = ctx.user.companyIds;
    if (companyId) {
      if (!companies.includes(companyId)) throw forbidden('COMPANY_ACCESS_DENIED', 'You do not have access to this company');
      companies = [companyId];
    }
    // The cursor is (transaction, seq), and only transactions older than every running one are
    // served: their order can't change any more, so a change committing late is never passed over.
    let after = { tx: '0', seq: 0 };
    if (since !== undefined && since !== '') {
      const issued = /^(\d{1,20})\.(\d{1,18})$/.exec(since);
      if (issued) after = { tx: issued[1], seq: Number(issued[2]) };
      else if (/^\d{1,18}$/.test(since)) {
        // A plain seq, from an app that last pulled before cursors had a transaction.
        const [row] = await ctx.db.select({ tx: sql<string>`${CL.txId}::text` }).from(CL).where(eq(CL.seq, Number(since)));
        after = { tx: row?.tx ?? '0', seq: Number(since) };
      } else throw badRequest('INVALID_CURSOR', 'The cursor is not one this API issued');
    }
    const cursorOf = (at: { tx: string; seq: number }) => `${at.tx}.${at.seq}`;
    if (!companies.length) return { changes: [], cursor: cursorOf(after), hasMore: false };

    const settled = sql`${CL.txId} < pg_snapshot_xmin(pg_current_snapshot())`;
    const fields = { seq: CL.seq, tx: sql<string>`${CL.txId}::text`.as('tx'), companyId: CL.companyId, entityType: CL.entityType, entityId: CL.entityId, op: CL.op, version: CL.version };
    type Change = { seq: number; tx: string; companyId: string; entityType: string; entityId: string; op: string; version: number };
    let rows: Change[];
    let cursor: string;
    let hasMore: boolean;
    if (since === undefined || since === '') {
      const [top] = await ctx.db
        .select({ seq: CL.seq, tx: sql<string>`${CL.txId}::text` })
        .from(CL)
        .where(and(inArray(CL.companyId, companies), settled))
        .orderBy(sql`${CL.txId} desc, ${CL.seq} desc`)
        .limit(1);
      const upTo = top ?? after;
      const latest = ctx.db
        .selectDistinctOn([CL.companyId, CL.entityType, CL.entityId], fields)
        .from(CL)
        .where(and(inArray(CL.companyId, companies), sql`(${CL.txId}, ${CL.seq}) <= (${upTo.tx}::xid8, ${upTo.seq}::bigint)`))
        .orderBy(CL.companyId, CL.entityType, CL.entityId, sql`${CL.txId} desc, ${CL.seq} desc`)
        .as('latest');
      const found = await ctx.db
        .select()
        .from(latest)
        .where(sql`${latest.op} <> 'delete'`)
        .orderBy(sql`${latest.tx}::xid8, ${latest.seq}`)
        .limit(limit + 1);
      hasMore = found.length > limit;
      rows = found.slice(0, limit);
      cursor = cursorOf(hasMore ? rows[rows.length - 1] : upTo);
    } else {
      const found = await ctx.db
        .select(fields)
        .from(CL)
        .where(and(inArray(CL.companyId, companies), settled, sql`(${CL.txId}, ${CL.seq}) > (${after.tx}::xid8, ${after.seq}::bigint)`))
        .orderBy(sql`${CL.txId}, ${CL.seq}`)
        .limit(limit + 1);
      hasMore = found.length > limit;
      const page = found.slice(0, limit);
      cursor = cursorOf(page.length ? page[page.length - 1] : after);
      const last = new Map<string, Change>();
      for (const r of page) {
        const key = `${r.companyId}:${r.entityType}:${r.entityId}`;
        last.delete(key);
        last.set(key, r);
      }
      rows = [...last.values()];
    }

    const keyOf = (r: Change) => `${r.companyId}:${r.entityType}:${r.entityId}`;
    const { data, failed } = await fetchEntities(ctx.req.server, ctx.req.headers.authorization, rows.filter((r) => r.op !== 'delete'));
    // Stop short of a change that couldn't be read, so the cursor stays behind it and it comes again.
    const stop = rows.findIndex((r) => r.op !== 'delete' && failed.has(keyOf(r)));
    if (stop === 0) throw new ApiError(503, 'SYNC_READ_FAILED', 'Could not read a change; try again');
    if (stop > 0) {
      rows = rows.slice(0, stop);
      cursor = cursorOf(rows[stop - 1]);
      hasMore = true;
    }
    return {
      changes: rows.map((r) =>
        compact({
          companyId: r.companyId,
          entityType: r.entityType,
          entityId: r.entityId,
          op: r.op === 'delete' ? ('delete' as const) : ('upsert' as const),
          version: r.version,
          data: r.op === 'delete' ? undefined : (data.get(keyOf(r)) as Json | undefined),
        }),
      ),
      cursor,
      hasMore,
    };
  },
});
