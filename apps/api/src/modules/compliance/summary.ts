import { and, count, desc, eq, exists, getTableColumns, gte, ilike, inArray, isNull, ne, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { isEInvoiceApplicable } from '@esmart/core/domain/eInvoice';
import { EWAY_MOVEMENT_KINDS } from '@esmart/core/domain/ewayBill';
import type { EInvoiceStatus } from '@esmart/core/types';
import { schema } from '@esmart/db';
import { defineHandlers, type AuthUser, type CompanyRow } from '../../context';
import type { DbOrTx } from '../../lib/audit';
import { companyCore, partyCore } from '../documents/engine';
import { documentsToWire, summariesToWire, toCoreDocument, type SummaryRow } from '../documents/wire';
import { companyItems, loadSettings, settingsCore, type SettingsRow } from './shared';

const D = schema.documents;
const E = schema.eInvoices;
const W = schema.ewayBills;
const P = schema.parties;

type Scope = { db: DbOrTx; company: CompanyRow; user: AuthUser; now: Date; branchId?: string };

const E_INVOICE_KINDS = ['invoice', 'salesReturn'] as const;

function docsInScope(s: Scope) {
  const branches = s.branchId ? [s.branchId] : s.user.branchIds;
  return and(eq(D.companyId, s.company.id), branches.length ? inArray(D.branchId, branches) : undefined);
}

const search = (q: string | undefined) => (q?.trim() ? or(ilike(D.number, `%${q.trim()}%`), ilike(P.name, `%${q.trim()}%`), ilike(E.irn, `%${q.trim()}%`)) : undefined);

/**
 * Finalised invoices and credit notes with no e-invoice attempt that core
 * says must be reported. Only a buyer with a GSTIN, an SEZ or an export can
 * need an IRN, so SQL narrows to those first.
 */
async function unattempted(s: Scope, settings: SettingsRow, extra?: SQL): Promise<SummaryRow[]> {
  if (!settings.einvoiceEnabled) return [];
  const rows = await s.db
    .select({ doc: D, party: P })
    .from(D)
    .innerJoin(P, eq(P.id, D.partyId))
    .leftJoin(E, eq(E.documentId, D.id))
    .where(
      and(
        docsInScope(s),
        inArray(D.kind, [...E_INVOICE_KINDS]),
        notInArray(D.status, ['draft', 'requested']),
        isNull(E.documentId),
        or(
          sql`${P.billingCountry} <> 'IN'`,
          eq(D.placeOfSupplyStateCode, '96'),
          inArray(P.gstRegistrationType, ['sez', 'overseas']),
          and(sql`coalesce(${P.gstRegistrationType}::text, '') <> 'unregistered'`, sql`nullif(trim(${P.taxId}), '') is not null`),
        ),
        extra,
      ),
    )
    .orderBy(desc(D.date), desc(D.createdAt), desc(D.id));
  if (!rows.length) return [];
  const docs = await documentsToWire(s.db, rows.map((r) => r.doc), s.now, s.company.baseCurrency.trim());
  const company = companyCore(s.company);
  const items = await companyItems(s.db, s.company.id);
  const core = settingsCore(settings);
  return rows
    .filter((r, i) => isEInvoiceApplicable({ document: toCoreDocument(docs[i]), company, buyer: partyCore(r.party), settings: core, items, now: s.now.toISOString() }).applicable)
    .map((r) => ({ ...r.doc, partyName: r.party.name }));
}

/** Finalised documents moving goods above the threshold with no live e-way bill: core's `isEwayBillRequired`, in SQL. */
function needingEwayBill(s: Scope, settings: SettingsRow) {
  const L = schema.documentLines;
  const I = schema.items;
  // `hasGoods`: a line for a goods item, or a free line whose HSN is not a service code.
  const goods = s.db
    .select({ one: sql`1` })
    .from(L)
    .leftJoin(I, eq(I.id, L.itemId))
    .where(and(eq(L.documentId, D.id), or(eq(I.type, 'goods'), and(isNull(I.id), sql`coalesce(trim(${L.hsnCode}), '') not like '99%'`))));
  const live = s.db
    .select({ one: sql`1` })
    .from(W)
    .where(and(eq(W.documentId, D.id), ne(W.status, 'cancelled'), gte(W.validUpto, s.now)));
  return and(
    docsInScope(s),
    inArray(D.kind, EWAY_MOVEMENT_KINDS),
    notInArray(D.status, ['draft', 'requested', 'cancelled']),
    sql`round(${D.grandTotalMinor} * ${D.exchangeRate}) > ${settings.ewayBillThresholdMinor}`,
    exists(goods),
    sql`not exists (${live})`,
  );
}

/**
 * Compliance: getComplianceSummary, listComplianceDocuments. The counts and
 * lists the app once worked out from every document it held, now from the
 * database: SQL narrows the candidates, core has the last word.
 */
export const summaryHandlers = defineHandlers({
  async getComplianceSummary(ctx) {
    const s: Scope = { db: ctx.db, company: ctx.company, user: ctx.user, now: ctx.now, branchId: ctx.query.branchId };
    const settings = await loadSettings(ctx.db, ctx.company);

    const eInvoice: Record<EInvoiceStatus, number> = { notApplicable: 0, pending: 0, generated: 0, cancelled: 0, failed: 0 };
    const attempted = await ctx.db
      .select({ status: E.status, n: count() })
      .from(E)
      .innerJoin(D, eq(D.id, E.documentId))
      .where(and(docsInScope(s), inArray(D.kind, [...E_INVOICE_KINDS])))
      .groupBy(E.status);
    for (const r of attempted) eInvoice[r.status] += Number(r.n);
    eInvoice.pending += (await unattempted(s, settings)).length;

    const branches = s.branchId ? [s.branchId] : ctx.user.branchIds;
    const soon = new Date(ctx.now.getTime() + 24 * 3600 * 1000);
    const [bills] = await ctx.db
      .select({
        active: sql<number>`count(*) filter (where ${W.status} <> 'cancelled' and ${W.validUpto} >= ${ctx.now})`,
        expired: sql<number>`count(*) filter (where ${W.status} <> 'cancelled' and ${W.validUpto} < ${ctx.now})`,
        cancelled: sql<number>`count(*) filter (where ${W.status} = 'cancelled')`,
        expiringSoon: sql<number>`count(*) filter (where ${W.status} <> 'cancelled' and ${W.validUpto} >= ${ctx.now} and ${W.validUpto} <= ${soon})`,
      })
      .from(W)
      .where(and(eq(W.companyId, ctx.company.id), branches.length ? inArray(W.branchId, branches) : undefined));

    const [outstanding] = settings.ewayBillEnabled ? await ctx.db.select({ n: count() }).from(D).where(needingEwayBill(s, settings)) : [{ n: 0 }];

    return {
      eInvoice,
      eway: { active: Number(bills.active), expired: Number(bills.expired), cancelled: Number(bills.cancelled) },
      expiringSoon: Number(bills.expiringSoon),
      ewayOutstanding: Number(outstanding.n),
    };
  },

  async listComplianceDocuments(ctx) {
    const q = ctx.query;
    const s: Scope = { db: ctx.db, company: ctx.company, user: ctx.user, now: ctx.now, branchId: q.branchId };
    const settings = await loadSettings(ctx.db, ctx.company);
    const limit = q.limit ?? 100;
    const columns = { ...getTableColumns(D), partyName: P.name };
    const newestFirst = (a: SummaryRow, b: SummaryRow) => b.date.localeCompare(a.date) || b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id);

    let rows: SummaryRow[];
    if (q.need === 'ewayBill') {
      rows = settings.ewayBillEnabled
        ? ((await ctx.db
            .select(columns)
            .from(D)
            .innerJoin(P, eq(P.id, D.partyId))
            .leftJoin(E, eq(E.documentId, D.id))
            .where(and(needingEwayBill(s, settings), search(q.q)))
            .orderBy(desc(D.date), desc(D.createdAt), desc(D.id))
            .limit(limit)) as SummaryRow[])
        : [];
    } else {
      const attempted = (await ctx.db
        .select(columns)
        .from(D)
        .innerJoin(P, eq(P.id, D.partyId))
        .innerJoin(E, eq(E.documentId, D.id))
        .where(and(docsInScope(s), inArray(D.kind, [...E_INVOICE_KINDS]), q.status ? eq(E.status, q.status) : ne(E.status, 'notApplicable'), search(q.q)))
        .orderBy(desc(D.date), desc(D.createdAt), desc(D.id))
        .limit(limit)) as SummaryRow[];
      const pending = q.status === undefined || q.status === 'pending' ? await unattempted(s, settings, search(q.q)) : [];
      rows = [...attempted, ...pending].sort(newestFirst).slice(0, limit);
    }
    return { data: await summariesToWire(ctx.db, rows, ctx.now) };
  },
});
