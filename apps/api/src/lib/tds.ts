import { and, eq, gte, inArray, lte, ne, notInArray, or, sql } from 'drizzle-orm';
import { financialYearOf } from '@esmart/core/lib/date';
import { tdsFor, type TdsResult } from '@esmart/core/domain/tds';
import { schema } from '@esmart/db';
import type { CompanyRow } from '../context';
import type { DbOrTx } from './audit';

const D = schema.documents;
const P = schema.parties;
const A = schema.paymentAllocations;
const PAY = schema.payments;

/**
 * TDS already kept back under `section` on money paid that is allocated to this bill: the bill then
 * keeps back only the rest (RULES 4.16, pending CA), so an advance paid net of TDS isn't taxed twice.
 */
export async function tdsOnPaymentsTo(db: DbOrTx, documentId: string | undefined, section: string): Promise<number> {
  if (!documentId) return 0;
  const [row] = await db
    .select({ tds: sql<number>`coalesce(sum(${A.tdsMinor}), 0)::bigint` })
    .from(A)
    .innerJoin(PAY, eq(PAY.id, A.paymentId))
    .where(and(eq(A.documentId, documentId), eq(PAY.direction, 'paid'), eq(PAY.tdsSection, section)));
  return Number(row?.tds ?? 0);
}

type PartyRow = typeof schema.parties.$inferSelect;

/**
 * What the business has already booked with a deductee under a section this financial year
 * (April to March, whatever the company's own year): the base TDS is worked on, and the TDS
 * deducted. A deductee is a PAN, so two supplier records with one PAN count together.
 * Bills and supplier debit notes add, supplier credit notes take away. (Expenses carry no TDS:
 * a bill TDS is kept back on goes in as a purchase bill.)
 */
export async function tdsYearSoFar(db: DbOrTx, companyId: string, party: PartyRow, section: string, date: string, except: { documentId?: string }) {
  const fy = financialYearOf(date, 4);
  const sameDeductee = party.pan ? await db.select({ id: P.id }).from(P).where(and(eq(P.companyId, companyId), eq(P.pan, party.pan))) : [{ id: party.id }];
  const ids = sameDeductee.map((p) => p.id);
  const base = sql<number>`round(${D.taxableAmountMinor} * ${D.exchangeRate})`;
  const docs = await db
    .select({
      base: sql<number>`coalesce(sum(case when ${D.kind} in ('supplierCreditNote', 'purchaseReturn') then -${base} else ${base} end), 0)::bigint`,
      tds: sql<number>`coalesce(sum(case when ${D.kind} in ('supplierCreditNote', 'purchaseReturn') then -${D.tdsAmountMinor} else ${D.tdsAmountMinor} end), 0)::bigint`,
    })
    .from(D)
    .where(
      and(
        eq(D.companyId, companyId),
        inArray(D.partyId, ids),
        inArray(D.kind, ['purchaseBill', 'supplierDebitNote', 'supplierCreditNote', 'purchaseReturn']),
        notInArray(D.status, ['draft', 'cancelled', 'rejected']),
        or(eq(D.tdsSection, section), sql`${D.tdsSection} is null`),
        gte(D.date, fy.start),
        lte(D.date, fy.end),
        except.documentId ? ne(D.id, except.documentId) : undefined,
      ),
    );
  return { baseMinor: Number(docs[0]?.base ?? 0), tdsMinor: Number(docs[0]?.tds ?? 0) };
}

/**
 * The section a bill is under: what it asked for (`none` for no TDS), else the supplier's. TDS
 * applies only for a company with a TAN.
 */
export function tdsSectionFor(company: CompanyRow, party: PartyRow, asked: string | null | undefined): string | null {
  if (!company.tan) return null;
  if (asked === 'none') return null;
  return asked ?? party.tdsSection ?? null;
}

/** TDS on one bill with `baseMinor` (base currency) under `section`. */
export async function tdsOn(
  db: DbOrTx,
  company: CompanyRow,
  party: PartyRow,
  section: string | null,
  date: string,
  baseMinor: number,
  except: { documentId?: string },
): Promise<TdsResult & { section: string | null }> {
  if (!section) return { section: null, rate: 0, amountMinor: 0, reason: 'none' };
  const prior = await tdsYearSoFar(db, company.id, party, section, date, except);
  const certificate = party.lowerTdsRate !== null && party.lowerTdsValidTill ? { rate: Number(party.lowerTdsRate), validTill: party.lowerTdsValidTill } : undefined;
  const deductedOnPaymentsMinor = await tdsOnPaymentsTo(db, except.documentId, section);
  return { section, ...tdsFor({ section, pan: party.pan ?? undefined, certificate, date, baseMinor, prior, deductedOnPaymentsMinor }) };
}
