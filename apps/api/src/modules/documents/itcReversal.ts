import { and, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, sql } from 'drizzle-orm';
import { schema } from '@esmart/db';
import type { Deps } from '../../context';
import { notify, noteMoney } from '../../lib/notify';
import { today } from './lifecycle';

const D = schema.documents;
/** Rule 37: credit on a bill not paid within 180 days of its date is reversed until it is. */
const DAYS = 180;
const OPEN = ['issued', 'partiallyPaid', 'overdue'] as const;

/**
 * The daily `itc.reversal180` job. Marks bills (and supplier debit notes) with GST on them that
 * are still unpaid 180 days after their date, and tells the business once; marks them reclaimed
 * once paid. GSTR-3B reads the two dates (table 4B(2) and 4A(5)). Both marks go on in the
 * statement that picks the bill, so a second run finds nothing.
 */
export async function reverseUnpaidItc(deps: Pick<Deps, 'db' | 'now'> & Deps): Promise<{ reversed: number; reclaimed: number }> {
  const asOf = today(deps.now());
  const cutoff = new Date(`${asOf}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - DAYS);
  const registered = deps.db
    .select({ id: schema.companies.id })
    .from(schema.companies)
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.companies.accountId))
    .where(and(isNull(schema.accounts.suspendedAt), isNull(schema.companies.archivedAt), eq(schema.accounts.isDemo, false), eq(schema.companies.taxRegistered, true)));

  const reversed = await deps.db
    .update(D)
    .set({ itcReversedOn: asOf })
    .where(
      and(
        inArray(D.kind, ['purchaseBill', 'supplierDebitNote']),
        inArray(D.status, [...OPEN]),
        lte(D.date, cutoff.toISOString().slice(0, 10)),
        gt(D.totalTaxMinor, 0),
        lt(D.amountPaidMinor, D.grandTotalMinor),
        isNull(D.itcReversedOn),
        inArray(D.companyId, registered),
      ),
    )
    .returning({ id: D.id, companyId: D.companyId, number: D.number, supplierDocNumber: D.supplierDocNumber, currency: D.currency, tax: D.totalTaxMinor });
  for (const bill of reversed) {
    await notify(deps.db, deps, {
      companyId: bill.companyId,
      kind: 'compliance',
      title: `Input tax credit on ${bill.supplierDocNumber ?? bill.number} reversed`,
      body: `Unpaid 180 days after its date: ${noteMoney(bill.tax, bill.currency)} of credit goes back in this month's GSTR-3B until the bill is paid.`,
      entityType: 'document',
      entityId: bill.id,
    });
  }

  const reclaimed = await deps.db
    .update(D)
    .set({ itcReclaimedOn: asOf })
    .where(and(isNotNull(D.itcReversedOn), isNull(D.itcReclaimedOn), gte(D.amountPaidMinor, D.grandTotalMinor), sql`${D.status} <> 'cancelled'`))
    .returning({ id: D.id });
  return { reversed: reversed.length, reclaimed: reclaimed.length };
}
