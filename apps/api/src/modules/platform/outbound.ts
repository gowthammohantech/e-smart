import { and, asc, eq, gte, ilike, lt, ne, or, sql, type SQL } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { schema } from '@esmart/db';
import { defineHandlers } from '../../context';
import { notFound } from '../../http/errors';
import { compact } from '../../lib/wire';
import { GSP_GATEWAYS, sameTarget, type GspGatewayName } from '../../providers/gsp/provider-name';
import { parseGspTarget } from '../../providers/gsp/router';
import { newestFirst } from '../audit/keyset';
import { defaultGspTargetOf } from './wire';

const O = schema.outboundCalls;
const U = schema.users;
const C = schema.companies;
const DAY_MS = 86_400_000;
const utcDay = (d: string) => new Date(`${d}T00:00:00Z`);

type Row = typeof O.$inferSelect;
type Named = { userName: string | null; userEmail: string | null; companyName: string | null };

const environmentOf = (value: string | null) => (value === 'sandbox' || value === 'production' ? value : undefined);

function toWire(row: Row, who: Named): Schema<'OutboundCall'> {
  return compact({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    service: row.service,
    environment: environmentOf(row.environment),
    operation: row.operation,
    method: row.method,
    host: row.host,
    path: row.path,
    status: row.status ?? undefined,
    outcome: row.outcome as Schema<'OutboundCall'>['outcome'],
    durationMs: row.durationMs,
    error: row.error ?? undefined,
    source: row.source as Schema<'OutboundCall'>['source'],
    route: row.route ?? undefined,
    jobKind: row.jobKind ?? undefined,
    requestId: row.requestId ?? undefined,
    userId: row.userRef ?? undefined,
    userName: who.userName ?? undefined,
    userEmail: who.userEmail ?? undefined,
    companyId: row.companyRef ?? undefined,
    companyName: who.companyName ?? undefined,
  });
}

/** The columns every list and detail read selects: the call, and the names behind its user and company. */
const withNames = () => ({ row: O, userName: U.name, userEmail: U.email, companyName: C.name });

const asJson = (value: unknown) => (value === null || value === undefined ? undefined : JSON.stringify(value));

/**
 * The third-party call log: every call this API made to a third party. Read-only; rows are written by
 * `trackedFetch` (src/lib/outbound.ts).
 */
export const outboundCallHandlers = defineHandlers({
  async listOutboundCalls(ctx) {
    const { service, environment, outcome, companyId, userId, requestId, q, from, to, limit, cursor } = ctx.query;
    const k = newestFirst({ cursor, limit, at: O.createdAt, id: O.id });
    const filters: SQL[] = [];
    if (service) filters.push(eq(O.service, service));
    if (environment) filters.push(eq(O.environment, environment));
    if (outcome === 'failed') filters.push(ne(O.outcome, 'ok'));
    else if (outcome) filters.push(eq(O.outcome, outcome));
    if (companyId) filters.push(eq(O.companyRef, companyId));
    if (userId) filters.push(eq(O.userRef, userId));
    if (requestId) filters.push(eq(O.requestId, requestId));
    if (from) filters.push(gte(O.createdAt, utcDay(from)));
    if (to) filters.push(lt(O.createdAt, new Date(utcDay(to).getTime() + DAY_MS)));
    if (q?.trim()) {
      const like = `%${q.trim().replace(/[\\%_]/g, '\\$&')}%`;
      filters.push(or(ilike(O.operation, like), ilike(O.path, like), ilike(O.route, like), ilike(O.error, like), ilike(O.service, like))!);
    }
    const rows = await ctx.db
      .select({ ...withNames(), cursorAt: k.cursorColumn })
      .from(O)
      .leftJoin(U, eq(U.id, O.userRef))
      .leftJoin(C, eq(C.id, O.companyRef))
      .where(and(...filters, k.where))
      .orderBy(...k.orderBy)
      .limit(k.take);
    return k.page(
      rows.slice(0, k.take - 1).map((r) => toWire(r.row, r)),
      rows.map((r) => ({ cursorAt: r.cursorAt, id: r.row.id })),
    );
  },

  async getOutboundCallSummary(ctx) {
    const hours = ctx.query.hours ?? 24;
    const since = new Date(ctx.now.getTime() - hours * 3_600_000);
    const rows = await ctx.db
      .select({
        service: O.service,
        environment: O.environment,
        calls: sql<number>`count(*)::int`,
        failures: sql<number>`(count(*) filter (where ${O.outcome} <> 'ok'))::int`,
        avgMs: sql<number>`round(avg(${O.durationMs}))::int`,
        p95Ms: sql<number>`round(percentile_cont(0.95) within group (order by ${O.durationMs}))::int`,
        lastCallAt: sql<Date>`max(${O.createdAt})`,
        lastFailureAt: sql<Date | null>`max(${O.createdAt}) filter (where ${O.outcome} <> 'ok')`,
      })
      .from(O)
      .where(gte(O.createdAt, since))
      .groupBy(O.service, O.environment)
      .orderBy(asc(O.service), asc(O.environment));
    const when = (v: Date | string | null) => (v ? new Date(v).toISOString() : undefined);
    return {
      hours,
      recording: ctx.deps.config.OUTBOUND_LOG,
      retentionDays: ctx.deps.config.OUTBOUND_LOG_RETENTION_DAYS,
      gspDefault: defaultGspTargetOf(ctx.deps.config),
      targets: rows.map((r) =>
        compact({
          service: r.service,
          environment: environmentOf(r.environment),
          calls: r.calls,
          failures: r.failures,
          avgMs: r.avgMs ?? undefined,
          p95Ms: r.p95Ms ?? undefined,
          lastCallAt: when(r.lastCallAt),
          lastFailureAt: when(r.lastFailureAt),
        }),
      ),
    };
  },

  async getOutboundCall(ctx) {
    const [found] = await ctx.db
      .select(withNames())
      .from(O)
      .leftJoin(U, eq(U.id, O.userRef))
      .leftJoin(C, eq(C.id, O.companyRef))
      .where(eq(O.id, ctx.params.callId))
      .limit(1);
    if (!found) throw notFound('Call');
    const { row } = found;

    // What else the same request called (a token fetch, then the filing), oldest first.
    const related = row.requestId
      ? await ctx.db
          .select(withNames())
          .from(O)
          .leftJoin(U, eq(U.id, O.userRef))
          .leftJoin(C, eq(C.id, O.companyRef))
          .where(and(eq(O.requestId, row.requestId), ne(O.id, row.id)))
          .orderBy(asc(O.createdAt), asc(O.id))
          .limit(50)
      : [];

    // For a GST gateway call made for a company: was it sent where the company is set to go?
    let gsp: Schema<'OutboundCallDetail'>['gsp'];
    const gateway = (GSP_GATEWAYS as readonly string[]).includes(row.service) ? (row.service as GspGatewayName) : undefined;
    const environment = environmentOf(row.environment);
    if (gateway && environment && row.companyRef) {
      const [company] = await ctx.db.select({ provider: C.gspProvider, environment: C.gspEnvironment }).from(C).where(eq(C.id, row.companyRef)).limit(1);
      if (company) {
        const went = { gateway, environment };
        const configured = parseGspTarget(company.provider, company.environment) ?? null;
        const fallback = defaultGspTargetOf(ctx.deps.config);
        gsp = { went, configured, default: fallback, matches: sameTarget(went, configured ?? fallback) };
      }
    }

    return {
      ...toWire(row, found),
      url: row.url,
      requestHeaders: asJson(row.requestHeaders),
      requestBody: row.requestBody ?? undefined,
      requestBytes: row.requestBytes ?? undefined,
      responseHeaders: asJson(row.responseHeaders),
      responseBody: row.responseBody ?? undefined,
      responseBytes: row.responseBytes ?? undefined,
      truncated: row.truncated,
      ...(gsp ? { gsp } : {}),
      related: related.map((r) => toWire(r.row, r)),
    };
  },
});
