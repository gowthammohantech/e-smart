import { and, eq, inArray, notInArray, or, sql, type AnyColumn } from 'drizzle-orm';
import { expenseTaxComponents } from '@esmart/core/domain/expenseTax';
import { dueDate, gstr3b, lateFeeAndInterest, liabilityOf, utilizeItc, type Gstr3b, type TaxKind, type Utilization } from '@esmart/core/domain/gstr3b';
import type { TaxSplit } from '@esmart/core/domain/itc';
import { businessDate } from '@esmart/core/lib/date';
import { schema } from '@esmart/db';
import type { CompanyRow } from '../../context';
import type { DbOrTx } from '../../lib/audit';
import { companyCore, partyCore } from '../documents/engine';
import { documentsToWire, toCoreDocument } from '../documents/wire';
import { toCoreExpense } from '../expenses/wire';
import { loadAdvanceEvents } from './advances';
import { periodBounds } from './gstr2b';

const D = schema.documents;
const R = schema.gstReturns;

/** The previous period's MMYYYY. */
export function previousPeriod(period: string): string {
  const m = Number(period.slice(0, 2));
  const y = Number(period.slice(2));
  return m === 1 ? `12${y - 1}` : `${String(m - 1).padStart(2, '0')}${y}`;
}

/** The branches whose documents a GSTIN's returns cover: those with it as their own GSTIN, or none and the company's. */
export async function branchesOf(db: DbOrTx, company: CompanyRow, gstin: string): Promise<string[]> {
  const branches = await db.select({ id: schema.branches.id, gstin: schema.branches.gstin }).from(schema.branches).where(eq(schema.branches.companyId, company.id));
  return branches.filter((b) => (b.gstin ?? company.taxIdentifier) === gstin).map((b) => b.id);
}

export type Built3b = { tables: Gstr3b; utilization: Utilization; due: string; carriedIn: Record<TaxKind, number> };

/**
 * GSTR-3B for one GSTIN and period, from the books: the period's sales and notes, bills claimed
 * from this period's 2B, reverse charge, 180-day reversals and reclaims, and expenses with credit.
 * The tax is then set off from this period's net credit plus what last period's return carried forward.
 */
export async function build3b(db: DbOrTx, company: CompanyRow, gstin: string, period: string, now: Date): Promise<Built3b> {
  const { from, to } = periodBounds(period);
  const base = company.baseCurrency.trim();
  const branchIds = await branchesOf(db, company, gstin);
  const inBranches = branchIds.length ? inArray(D.branchId, branchIds) : undefined;
  const rows = branchIds.length
    ? await db
        .select()
        .from(D)
        .where(
          and(
            eq(D.companyId, company.id),
            inBranches,
            notInArray(D.status, ['draft', 'requested', 'cancelled', 'rejected']),
            or(
              and(inArray(D.kind, ['invoice', 'debitNote', 'salesReturn', 'creditNote', 'purchaseBill', 'supplierDebitNote', 'purchaseReturn', 'supplierCreditNote']), sqlBetween(D.date, from, to)),
              eq(D.itcClaimPeriod, period),
              sqlBetween(D.itcReversedOn, from, to),
              sqlBetween(D.itcReclaimedOn, from, to),
            ),
          ),
        )
    : [];
  const documents = (await documentsToWire(db, rows, now, base)).map(toCoreDocument);
  const partyIds = [...new Set(rows.map((r) => r.partyId))];
  const parties = partyIds.length ? (await db.select().from(schema.parties).where(inArray(schema.parties.id, partyIds))).map(partyCore) : [];

  const E = schema.expenses;
  const expenseRows = branchIds.length ? await db.select().from(E).where(and(eq(E.companyId, company.id), inArray(E.branchId, branchIds), sqlBetween(E.date, from, to))) : [];
  const T = schema.taxCategories;
  const rates = new Map((await db.select({ id: T.id, rate: T.rate }).from(T).where(eq(T.companyId, company.id))).map((t) => [t.id, Number(t.rate)]));
  const core = companyCore(company);
  const expenses = expenseRows.map(toCoreExpense);
  const expenseSplit = new Map<string, TaxSplit>();
  for (const e of expenses) {
    if (!e.taxCategoryId || !e.taxAmount.minor) continue;
    const parts = expenseTaxComponents(e, rates.get(e.taxCategoryId) ?? 0, core);
    const rate = e.exchangeRate || 1;
    const split = { igst: 0, cgst: 0, sgst: 0, cess: 0 };
    for (const c of parts) {
      const k = c.type.toLowerCase() as keyof typeof split;
      if (k in split) split[k] += Math.round(c.amount.minor * rate);
    }
    expenseSplit.set(e.id, split);
  }

  const advances = await loadAdvanceEvents(db, company, to, branchIds);
  const tables = gstr3b({ period, company: core, gstin, baseCurrency: base, documents, expenses, parties, expenseSplit, advances });

  // What the last return left unused carries into this one's set-off.
  const [prev] = await db.select({ payload: R.payload }).from(R).where(and(eq(R.companyId, company.id), eq(R.gstin, gstin), eq(R.returnType, 'gstr3b'), eq(R.period, previousPeriod(period))));
  const carriedIn = ((prev?.payload as { utilization?: Utilization } | null)?.utilization?.carriedForward ?? { igst: 0, cgst: 0, sgst: 0, cess: 0 }) as Record<TaxKind, number>;
  const available = { igst: tables.itc.net.igst + carriedIn.igst, cgst: tables.itc.net.cgst + carriedIn.cgst, sgst: tables.itc.net.sgst + carriedIn.sgst, cess: tables.itc.net.cess + carriedIn.cess };
  const { forward, reverseCharge } = liabilityOf(tables);
  let utilization = utilizeItc(forward, reverseCharge, available);
  const due = dueDate(period, company.returnFrequency, gstin.slice(0, 2));
  // Filing today: the late fee and interest it would carry (table 5.1), paid in cash too.
  // The cap follows the turnover the compliance settings record (notification 19/2021-CT).
  const [settings] = await db.select({ turnover: schema.complianceSettings.annualTurnoverMinor }).from(schema.complianceSettings).where(eq(schema.complianceSettings.companyId, company.id));
  const late = lateFeeAndInterest(tables, utilization.cash, due, businessDate(now), settings?.turnover || undefined);
  tables.lateFee = late.lateFee;
  tables.interest = { taxable: 0, ...late.interest };
  if (late.lateFee.cgst || late.interest.igst + late.interest.cgst + late.interest.sgst + late.interest.cess) {
    utilization = { ...utilization, cash: { igst: utilization.cash.igst + late.interest.igst, cgst: utilization.cash.cgst + late.interest.cgst + late.lateFee.cgst, sgst: utilization.cash.sgst + late.interest.sgst + late.lateFee.sgst, cess: utilization.cash.cess + late.interest.cess } };
  }
  return { tables, utilization, due, carriedIn };
}

/** `column between from and to`, for date columns. */
function sqlBetween(column: AnyColumn, from: string, to: string) {
  return sql`${column} between ${from} and ${to}`;
}
