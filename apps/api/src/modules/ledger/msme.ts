import { and, eq, inArray, isNull, lte, ne } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { MSME_WARN_DAYS, msmePayables, sec43bh } from '@esmart/core/domain/msme';
import type { BusinessDocument, Party, Payment } from '@esmart/core/types';
import { schema } from '@esmart/db';
import type { CompanyRow, Deps } from '../../context';
import type { DbOrTx } from '../../lib/audit';
import { notify } from '../../lib/notify';
import { money } from '../../lib/wire';
import { today } from '../documents/lifecycle';

const D = schema.documents;
const P = schema.parties;

/** Micro and small suppliers, their bills up to `asOf`, and what was paid against them: what core's msme functions read. */
async function loadMsme(db: DbOrTx, companyId: string, asOf: string, branchIds: string[] = []) {
  const parties = await db.select({ id: P.id, name: P.name, msmeType: P.msmeType, paymentTermsDays: P.paymentTermsDays }).from(P).where(and(eq(P.companyId, companyId), inArray(P.msmeType, ['micro', 'small'])));
  if (!parties.length) return { parties: [], bills: [], payments: [], names: new Map<string, string>() };
  const rows = await db
    .select()
    .from(D)
    .where(and(eq(D.companyId, companyId), eq(D.kind, 'purchaseBill'), ne(D.status, 'draft'), lte(D.date, asOf), inArray(D.partyId, parties.map((p) => p.id)), branchIds.length ? inArray(D.branchId, branchIds) : undefined));
  const bills = rows.map(
    (r) =>
      ({
        id: r.id,
        kind: r.kind,
        status: r.status,
        number: r.number,
        supplierDocNumber: r.supplierDocNumber ?? undefined,
        partyId: r.partyId,
        date: r.date,
        dueDate: r.dueDate ?? undefined,
        currency: r.currency.trim(),
        totals: { grandTotal: { minor: r.grandTotalMinor, currency: r.currency.trim() } },
        tds: r.tdsAmountMinor ? { section: r.tdsSection ?? '', rate: Number(r.tdsRate ?? 0), amount: { minor: r.tdsAmountMinor, currency: r.currency.trim() } } : undefined,
      }) as unknown as BusinessDocument,
  );
  const A = schema.paymentAllocations;
  const allocations = rows.length
    ? await db
        .select({ paymentId: A.paymentId, documentId: A.documentId, amountMinor: A.amountMinor, tdsMinor: A.tdsMinor, discountMinor: A.discountMinor, writeOffMinor: A.writeOffMinor, date: schema.payments.date })
        .from(A)
        .innerJoin(schema.payments, eq(schema.payments.id, A.paymentId))
        .where(inArray(A.documentId, rows.map((r) => r.id)))
    : [];
  const byPayment = new Map<string, Payment>();
  for (const a of allocations) {
    const p = byPayment.get(a.paymentId) ?? ({ id: a.paymentId, date: a.date, allocations: [] } as unknown as Payment);
    const m = (minor: number) => ({ minor, currency: 'INR' });
    p.allocations.push({ documentId: a.documentId, documentNumber: '', amount: m(a.amountMinor), tdsDeducted: m(a.tdsMinor), discount: m(a.discountMinor), writeOff: m(a.writeOffMinor) });
    byPayment.set(a.paymentId, p);
  }
  return { parties: parties as Party[], bills, payments: [...byPayment.values()], names: new Map(parties.map((p) => [p.id, p.name])) };
}

/** The msme-payables report as of `asOf`. */
export async function msmeReport(db: DbOrTx, company: CompanyRow, asOf: string, branchIds: string[]): Promise<Schema<'MsmePayables'>> {
  const base = company.baseCurrency.trim();
  const { parties, bills, payments, names } = await loadMsme(db, company.id, asOf, branchIds);
  const bankRate = Number(company.msmeBankRate);
  const rows = msmePayables(asOf, bills, parties, payments, bankRate);
  const late = sec43bh(asOf, bills, parties, payments, company.fiscalYearStartMonth);
  const sum = (list: typeof rows) => money(list.reduce((a, r) => a + r.outstandingMinor, 0), base);
  return {
    rows: rows.map((r) => ({
      documentId: r.documentId,
      number: r.number,
      supplierDocNumber: r.supplierDocNumber,
      partyId: r.partyId,
      partyName: names.get(r.partyId),
      msmeType: r.msmeType,
      date: r.date,
      dueDate: r.dueDate,
      outstanding: money(r.outstandingMinor, r.currency),
      daysLeft: r.daysLeft,
      interest: money(r.interestMinor, r.currency),
    })),
    notPaidInTime: late.map((r) => ({ documentId: r.documentId, number: r.number, partyId: r.partyId, partyName: names.get(r.partyId), date: r.date, dueDate: r.dueDate, amount: money(r.notPaidInTimeMinor, r.currency) })),
    bankRate,
    outstanding: sum(rows),
    overdue: sum(rows.filter((r) => r.daysLeft < 0)),
  };
}

/**
 * The daily `msme.reminders` job: a week before a micro or small supplier's bill falls due, and once it
 * is overdue, the business is told, once each, so it can pay within the 45 days the law allows.
 */
export async function remindMsmeDue(deps: Deps): Promise<number> {
  const asOf = today(deps.now());
  const companies = await deps.db
    .selectDistinct({ id: P.companyId })
    .from(P)
    .innerJoin(schema.companies, eq(schema.companies.id, P.companyId))
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.companies.accountId))
    .where(and(inArray(P.msmeType, ['micro', 'small']), isNull(schema.accounts.suspendedAt)));
  let sent = 0;
  for (const { id: companyId } of companies) {
    const { parties, bills, payments, names } = await loadMsme(deps.db, companyId, asOf);
    for (const r of msmePayables(asOf, bills, parties, payments)) {
      if (r.daysLeft > MSME_WARN_DAYS) continue;
      const overdue = r.daysLeft < 0;
      const title = overdue ? `${r.number} to ${names.get(r.partyId)} is past the MSME limit` : `${r.number} to ${names.get(r.partyId)} is due by ${r.dueDate}`;
      const N = schema.notifications;
      const [already] = await deps.db.select({ id: N.id }).from(N).where(and(eq(N.companyId, companyId), eq(N.entityType, 'document'), eq(N.entityId, r.documentId), eq(N.title, title.slice(0, 200)))).limit(1);
      if (already) continue;
      const owed = `${r.currency} ${(r.outstandingMinor / 100).toFixed(2)}`;
      await notify(deps.db, deps, {
        companyId,
        kind: 'compliance',
        title,
        body: overdue
          ? `${owed} was due ${r.dueDate}. Interest runs at three times the bank rate, and an unpaid bill can't be deducted this year.`
          : `${owed} to a ${r.msmeType} enterprise; pay by ${r.dueDate} to stay within the 45 days the MSMED Act allows.`,
        entityType: 'document',
        entityId: r.documentId,
      });
      sent++;
    }
  }
  return sent;
}
