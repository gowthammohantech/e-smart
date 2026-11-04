import { and, eq, gte, inArray, isNull, lte, notInArray, or } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { normalizeNumber, reconcile2b, type BookBill, type TwoBLine } from '@esmart/core/domain/reconcile2b';
import { schema } from '@esmart/db';
import type { AuthUser, CompanyRow, Deps } from '../../context';
import { notFound } from '../../http/errors';
import type { DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { notify } from '../../lib/notify';
import { money } from '../../lib/wire';
import { portalContext, returnsFailure } from './portal';

const P = schema.gstr2bPeriods;
const E = schema.gstr2bEntries;
const D = schema.documents;
type EntryRow = typeof E.$inferSelect;

/** `092026` → the period's first and last day. */
export function periodBounds(period: string): { from: string; to: string } {
  const m = Number(period.slice(0, 2));
  const y = Number(period.slice(2));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${y}-${String(m).padStart(2, '0')}-01`, to: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}` };
}

const decisionKey = (e: { supplierGstin: string; documentType: string; matchKey: string }) => `${e.supplierGstin}|${e.documentType}|${e.matchKey}`;

/**
 * Downloads a period's GSTR-2B and stores its lines in place of what was there, carrying each
 * line's decision over by supplier, kind and number. 409 GSTR2B_NOT_GENERATED until GSTN has made it.
 */
export async function fetchGstr2b(db: DbOrTx, deps: Deps, company: CompanyRow, actorId: string | null, gstin: string, period: string) {
  const ctx = await portalContext(db, deps, company, gstin);
  let result;
  try {
    result = await deps.providers.returns.getGstr2b(ctx, period);
  } catch (error) {
    returnsFailure(error);
  }
  if (result.status === 'notGenerated') return { generated: false as const };
  await db.transaction(async (tx) => {
    const before = await tx.select().from(E).where(and(eq(E.companyId, company.id), eq(E.gstin, gstin), eq(E.period, period)));
    const kept = new Map(before.filter((e) => e.decision).map((e) => [decisionKey(e), e]));
    await tx.delete(E).where(and(eq(E.companyId, company.id), eq(E.gstin, gstin), eq(E.period, period)));
    if (result.entries.length) {
      await tx.insert(E).values(
        result.entries.map((x) => {
          const matchKey = normalizeNumber(x.number).slice(0, 40);
          const old = kept.get(decisionKey({ supplierGstin: x.supplierGstin, documentType: x.documentType, matchKey }));
          return {
            id: newId('g2b'),
            companyId: company.id,
            gstin,
            period,
            section: x.section,
            supplierGstin: x.supplierGstin,
            supplierName: x.supplierName ?? null,
            documentType: x.documentType,
            number: x.number.slice(0, 40),
            matchKey,
            date: x.date,
            placeOfSupply: x.placeOfSupply ?? null,
            reverseCharge: x.reverseCharge,
            taxableMinor: x.taxableMinor,
            igstMinor: x.igstMinor,
            cgstMinor: x.cgstMinor,
            sgstMinor: x.sgstMinor,
            cessMinor: x.cessMinor,
            itcAvailable: x.itcAvailable,
            itcReason: x.itcReason ?? null,
            supplierFiledOn: x.supplierFiledOn ?? null,
            originalNumber: x.originalNumber ?? null,
            decision: old?.decision ?? null,
            linkedDocumentId: old?.linkedDocumentId ?? null,
            decidedBy: old?.decidedBy ?? null,
            decidedAt: old?.decidedAt ?? null,
          };
        }),
      );
    }
    const generatedOn = /^\d{4}-\d{2}-\d{2}$/.test(result.generatedAt) ? result.generatedAt : null;
    await tx
      .insert(P)
      .values({ companyId: company.id, gstin, period, generatedOn, fetchedAt: deps.now(), fetchedBy: actorId })
      .onConflictDoUpdate({ target: [P.companyId, P.gstin, P.period], set: { generatedOn, fetchedAt: deps.now(), fetchedBy: actorId } });
  });
  return { generated: true as const, lines: result.entries.length };
}

/** The GSTIN a bill's credit is claimed under: its branch's own, else the company's. */
async function billsFor(db: DbOrTx, company: CompanyRow, gstin: string, period: string) {
  const { to } = periodBounds(period);
  // Credit for a year can be claimed until 30 November after it (s.16(4)): last year's bills are still in play.
  const from = `${Number(to.slice(0, 4)) - (Number(to.slice(5, 7)) >= 4 ? 1 : 2)}-04-01`;
  const branches = await db.select({ id: schema.branches.id, gstin: schema.branches.gstin }).from(schema.branches).where(eq(schema.branches.companyId, company.id));
  const branchIds = branches.filter((b) => (b.gstin ?? company.taxIdentifier) === gstin).map((b) => b.id);
  if (!branchIds.length) return { rows: [], bills: [] as BookBill[] };
  const rows = await db
    .select({ doc: D, partyGstin: schema.parties.taxId })
    .from(D)
    .innerJoin(schema.parties, eq(schema.parties.id, D.partyId))
    .where(
      and(
        eq(D.companyId, company.id),
        inArray(D.branchId, branchIds),
        inArray(D.kind, ['purchaseBill', 'supplierCreditNote', 'supplierDebitNote']),
        notInArray(D.status, ['draft', 'cancelled', 'rejected']),
        gte(D.date, from),
        lte(D.date, to),
        or(isNull(D.itcClaimPeriod), eq(D.itcClaimPeriod, period)),
      ),
    );
  const bills: BookBill[] = rows
    .filter((r) => r.doc.partyGstin ?? r.partyGstin)
    .map(({ doc, partyGstin }) => {
      const rate = Number(doc.exchangeRate) || 1;
      return {
        id: doc.id,
        kind: doc.kind as BookBill['kind'],
        supplierGstin: (doc.partyGstin ?? partyGstin)!,
        number: doc.supplierDocNumber ?? doc.number,
        date: doc.date,
        taxableMinor: Math.round(doc.taxableAmountMinor * rate),
        taxMinor: Math.round(doc.totalTaxMinor * rate),
        claimedIn: doc.itcClaimPeriod ?? undefined,
      };
    });
  return { rows, bills };
}

const line = (e: EntryRow): TwoBLine => ({
  id: e.id,
  supplierGstin: e.supplierGstin,
  documentType: e.documentType as TwoBLine['documentType'],
  number: e.number,
  date: e.date,
  taxableMinor: e.taxableMinor,
  taxMinor: e.igstMinor + e.cgstMinor + e.sgstMinor + e.cessMinor,
  itcAvailable: e.itcAvailable,
  decision: e.decision ?? undefined,
  linkedDocumentId: e.linkedDocumentId ?? undefined,
});

/** The period's 2B against the books, as the review screen shows it. */
export async function reconciliation(db: DbOrTx, company: CompanyRow, gstin: string, period: string): Promise<Schema<'Gstr2bReconciliation'>> {
  const base = company.baseCurrency.trim();
  const m = (minor: number) => money(minor, base);
  const [p] = await db.select().from(P).where(and(eq(P.companyId, company.id), eq(P.gstin, gstin), eq(P.period, period)));
  if (!p) return { gstin, period, fetched: false, rows: [], missingIn2b: [], summary: { lines: 0, matched: 0, partial: 0, probable: 0, missingInBooks: 0, missingIn2b: 0, claimableTax: m(0) } };
  const entries = await db.select().from(E).where(and(eq(E.companyId, company.id), eq(E.gstin, gstin), eq(E.period, period))).orderBy(E.supplierGstin, E.date);
  const { bills, rows: docs } = await billsFor(db, company, gstin, period);
  const r = reconcile2b(entries.map(line), bills);
  const docOf = new Map(docs.map((d) => [d.doc.id, d.doc]));
  const billWire = (b: BookBill) => ({ documentId: b.id, kind: b.kind, number: docOf.get(b.id)?.number ?? b.number, supplierNumber: b.number, date: b.date, taxable: m(b.taxableMinor), tax: m(b.taxMinor), claimedIn: b.claimedIn });
  const count = (s: string) => r.matches.filter((x) => x.status === s).length;
  return {
    gstin,
    period,
    fetched: true,
    fetchedAt: p.fetchedAt.toISOString(),
    generatedOn: p.generatedOn ?? undefined,
    rows: r.matches.map((x) => {
      const e = entries.find((y) => y.id === x.line.id)!;
      return {
        id: e.id,
        section: e.section,
        supplierGstin: e.supplierGstin,
        supplierName: e.supplierName ?? undefined,
        documentType: e.documentType as 'I' | 'C' | 'D' | 'BOE',
        number: e.number,
        date: e.date,
        taxable: m(e.taxableMinor),
        tax: m(x.line.taxMinor),
        reverseCharge: e.reverseCharge,
        itcAvailable: e.itcAvailable,
        itcReason: e.itcReason ?? undefined,
        status: x.status,
        decision: e.decision ?? undefined,
        bill: x.bill ? billWire(x.bill) : undefined,
        difference: x.difference ? { taxable: m(x.difference.taxableMinor), tax: m(x.difference.taxMinor), days: x.difference.days } : undefined,
      };
    }),
    missingIn2b: r.missingIn2b.map(billWire),
    summary: {
      lines: entries.length,
      matched: count('matched'),
      partial: count('partial'),
      probable: count('probable'),
      missingInBooks: count('missingInBooks'),
      missingIn2b: r.missingIn2b.length,
      claimableTax: m(r.claimableTaxMinor),
    },
  };
}

/** A person's call on one line: link it to a bill, set it aside, or undo that. */
export async function decide(db: DbOrTx, company: CompanyRow, actor: AuthUser, entryId: string, decision: 'accepted' | 'notOurs' | 'claimLater' | 'undecided', documentId: string | undefined, now: Date) {
  const [e] = await db.select().from(E).where(and(eq(E.companyId, company.id), eq(E.id, entryId)));
  if (!e) throw notFound('GSTR-2B line');
  if (documentId) {
    const [doc] = await db.select({ id: D.id }).from(D).where(and(eq(D.companyId, company.id), eq(D.id, documentId)));
    if (!doc) throw notFound('Document');
  }
  await db
    .update(E)
    .set(
      decision === 'undecided'
        ? { decision: null, linkedDocumentId: null, decidedBy: null, decidedAt: null }
        : { decision, linkedDocumentId: decision === 'accepted' ? (documentId ?? e.linkedDocumentId) : null, decidedBy: actor.id, decidedAt: now },
    )
    .where(eq(E.id, e.id));
}

/**
 * Claims the period's credit: every bill matched (by the matcher or a person) to a 2B line that
 * marks it available gets `itc_claim_period`, which GSTR-3B reads. Returns how many were claimed.
 */
export async function claimMatched(db: DbOrTx, company: CompanyRow, gstin: string, period: string): Promise<number> {
  const rec = await reconciliation(db, company, gstin, period);
  const ids = (rec.rows ?? []).flatMap((r) => (r.status === 'matched' && r.itcAvailable && r.bill?.documentId ? [r.bill.documentId] : []));
  if (!ids.length) return 0;
  await db.update(D).set({ itcClaimPeriod: period }).where(and(eq(D.companyId, company.id), inArray(D.id, ids)));
  return ids.length;
}

/**
 * The daily `gstr2b.fetch` job: from the 14th, when GSTN generates last month's 2B, downloads it for
 * every connected GSTIN that doesn't have it yet, and tells the business what it found.
 */
export async function fetchDueGstr2b(deps: Deps): Promise<number> {
  const now = deps.now();
  const ist = new Date(now.getTime() + 330 * 60_000);
  if (ist.getUTCDate() < 14) return 0;
  const prev = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - 1, 1));
  const period = `${String(prev.getUTCMonth() + 1).padStart(2, '0')}${prev.getUTCFullYear()}`;
  const S = schema.gstPortalSessions;
  const sessions = await deps.db.select({ companyId: S.companyId, gstin: S.gstin }).from(S).where(gte(S.refreshableUntil, now));
  let fetched = 0;
  for (const s of sessions) {
    const [done] = await deps.db.select({ g: P.gstin }).from(P).where(and(eq(P.companyId, s.companyId), eq(P.gstin, s.gstin), eq(P.period, period)));
    if (done) continue;
    const [company] = await deps.db.select().from(schema.companies).where(eq(schema.companies.id, s.companyId));
    try {
      const r = await fetchGstr2b(deps.db, deps, company, null, s.gstin, period);
      if (!r.generated) continue;
      fetched++;
      const sum = (await reconciliation(deps.db, company, s.gstin, period)).summary!;
      await notify(deps.db, deps, {
        companyId: company.id,
        kind: 'compliance',
        title: `GSTR-2B for ${period.slice(0, 2)}/${period.slice(2)} is in`,
        body: `${sum.matched} of ${sum.lines} lines match your bills; ${sum.partial! + sum.probable! + sum.missingInBooks!} need a look, and ${sum.missingIn2b} bills aren't in it yet.`,
        entityType: 'company',
        entityId: company.id,
      });
    } catch {
      // A session that lapsed, or the portal not answering: tomorrow's run tries again.
    }
  }
  return fetched;
}
