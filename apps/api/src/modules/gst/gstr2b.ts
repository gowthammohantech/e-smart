import { and, eq, gte, inArray, isNull, notInArray, or } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { CLAIMABLE, normalizeNumber, reconcile2b, type BookBill, type TwoBLine } from '@esmart/core/domain/reconcile2b';
import { schema } from '@esmart/db';
import type { AuthUser, CompanyRow, Deps } from '../../context';
import { invalid, notFound } from '../../http/errors';
import type { DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { notify } from '../../lib/notify';
import { money } from '../../lib/wire';
import type { Gstr2bResult } from '../../providers/returns';
import { readGstr2bFile } from './gstr2bFile';
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
  await store2b(db, company, actorId, gstin, period, result, deps.now());
  return { generated: true as const, lines: result.entries.length };
}

/**
 * Reads a GSTR-2B the taxpayer downloaded from the GST portal (its JSON, or its Excel workbook) and
 * stores it as a download would, for a business with no portal session. A JSON file names its
 * GSTIN and period; one that isn't this GSTIN's or period's is refused.
 */
export async function importGstr2b(db: DbOrTx, company: CompanyRow, actorId: string, gstin: string, period: string, fileName: string, contentBase64: string, now: Date) {
  const file = await readGstr2bFile(fileName, contentBase64);
  if (file.gstin && file.gstin !== gstin) throw invalid('contentBase64', `This file is the GSTR-2B of ${file.gstin}, not ${gstin}`, 'GSTR2B_WRONG_GSTIN');
  if (file.period && file.period !== period) throw invalid('contentBase64', `This file is the GSTR-2B for ${file.period.slice(0, 2)}/${file.period.slice(2)}, not ${period.slice(0, 2)}/${period.slice(2)}`, 'GSTR2B_WRONG_PERIOD');
  await store2b(db, company, actorId, gstin, period, file.result, now);
  return { lines: file.result.entries.length };
}

/** A period's 2B lines, in place of what was there, carrying each line's decision over by supplier, kind and number. */
async function store2b(db: DbOrTx, company: CompanyRow, actorId: string | null, gstin: string, period: string, result: Extract<Gstr2bResult, { status: 'generated' }>, now: Date) {
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
            supplierName: x.supplierName?.slice(0, 200) ?? null,
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
            itcReason: x.itcReason?.slice(0, 40) ?? null,
            supplierFiledOn: x.supplierFiledOn ?? null,
            originalNumber: x.originalNumber?.slice(0, 40) ?? null,
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
      .values({ companyId: company.id, gstin, period, generatedOn, fetchedAt: now, fetchedBy: actorId })
      .onConflictDoUpdate({ target: [P.companyId, P.gstin, P.period], set: { generatedOn, fetchedAt: now, fetchedBy: actorId } });
  });
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
        // No upper bound: a bill entered on the day it came, after the period, is still that period's.
        gte(D.date, from),
        or(isNull(D.itcClaimPeriod), eq(D.itcClaimPeriod, period)),
      ),
    );
  // An import is in 2B only as its bill of entry: matched on the BoE number, with the IGST and cess
  // customs assessed (already in base currency). A bill with no supplier GSTIN and no BoE still tries its own number.
  const bills: BookBill[] = rows.map(({ doc, partyGstin }) => {
      const rate = Number(doc.exchangeRate) || 1;
      const boe = doc.billOfEntry as { number: string; date: string; portCode: string; assessableMinor: number; igstMinor: number; cessMinor: number } | null;
      if (boe) {
        return { id: doc.id, kind: 'purchaseBill', supplierGstin: boe.portCode, number: boe.number, date: boe.date, taxableMinor: boe.assessableMinor, taxMinor: boe.igstMinor + boe.cessMinor, claimedIn: doc.itcClaimPeriod ?? undefined };
      }
      return {
        id: doc.id,
        kind: doc.kind as BookBill['kind'],
        supplierGstin: doc.partyGstin ?? partyGstin ?? '',
        number: doc.supplierDocNumber ?? doc.number,
        date: doc.date,
        // An ISD invoice passes on credit alone: 2B shows no taxable value for it.
        taxableMinor: doc.isdInvoice ? 0 : Math.round(doc.taxableAmountMinor * rate),
        // 2B shows the tax on a reverse-charge supply too, though the buyer pays it.
        taxMinor: Math.round((doc.totalTaxMinor + doc.reverseChargeTaxMinor) * rate),
        claimedIn: doc.itcClaimPeriod ?? undefined,
      };
    });
  return { rows, bills, to };
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
  if (!p) return { gstin, period, fetched: false, rows: [], missingIn2b: [], summary: { lines: 0, matched: 0, matchedWithinTolerance: 0, manuallyLinked: 0, claimed: 0, partial: 0, probable: 0, missingInBooks: 0, missingIn2b: 0, claimableTax: m(0) } };
  const entries = await db.select().from(E).where(and(eq(E.companyId, company.id), eq(E.gstin, gstin), eq(E.period, period))).orderBy(E.supplierGstin, E.date);
  const { bills, rows: docs, to } = await billsFor(db, company, gstin, period);
  const found = reconcile2b(entries.map(line), bills, { periodEnd: to, dateToleranceDays: company.gstr2bDateToleranceDays });
  // An import's bill isn't chased: its supplier files no GSTR-1.
  const r = { ...found, missingIn2b: found.missingIn2b.filter((b) => b.supplierGstin) };
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
        documentType: e.documentType as 'I' | 'C' | 'D' | 'BOE' | 'ISD',
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
        reasons: x.reasons,
      };
    }),
    missingIn2b: r.missingIn2b.map(billWire),
    summary: {
      lines: entries.length,
      matched: count('matched'),
      matchedWithinTolerance: count('matchedWithinTolerance'),
      manuallyLinked: count('manuallyLinked'),
      claimed: count('claimed'),
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
  const ids = (rec.rows ?? []).flatMap((r) => (CLAIMABLE.includes(r.status!) && r.itcAvailable && r.bill?.documentId ? [r.bill.documentId] : []));
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
    // An archived business files nothing more.
    if (!company || company.archivedAt) continue;
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
