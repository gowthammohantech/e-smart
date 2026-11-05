import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { isPayableDocument } from '@esmart/core/domain/documentStates';
import type { Schema } from '@esmart/api-contract';
import { formatDate } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { schema } from '@esmart/db';
import type { CompanyRow } from '../../context';
import type { DbOrTx } from '../../lib/audit';
import { iso, money } from '../../lib/wire';
import { esc, printablePage } from '../payments/receipt';
import { partyToWire } from './wire';

type PartyRow = typeof schema.parties.$inferSelect;
type Statement = Schema<'PartyStatement'>;
type Entry = { date: string; at: string; entityType: 'document' | 'payment' | 'voucher'; entityId: string; number: string; debit: number; credit: number };

/**
 * A party's running ledger, in the party's currency.
 *
 * Customers: invoices are debits, credit notes (sales returns) and money
 * received are credits, refunds paid are debits; the balance is what they
 * owe. Suppliers mirror that: bills are credits, debit notes and money paid
 * are debits, and the balance is what the company owes them. A positive
 * opening balance means the same thing for each (as on the party record).
 *
 * Drafts, unapproved returns and cancelled documents are not on the ledger.
 * Entries before `from` roll into the opening balance.
 */
export async function partyStatement(db: DbOrTx, company: CompanyRow, party: PartyRow, range: { from?: string; to?: string }): Promise<Statement> {
  const currency = party.currency.trim();
  const baseCurrency = company.baseCurrency.trim();
  const supplier = party.kind === 'supplier';
  const D = schema.documents;
  const kinds = supplier
    ? (['purchaseBill', 'purchaseReturn', 'supplierCreditNote', 'supplierDebitNote'] as const)
    : (['invoice', 'salesReturn', 'creditNote', 'debitNote'] as const);
  const docs = await db
    .select()
    .from(D)
    .where(and(eq(D.companyId, company.id), eq(D.partyId, party.id), inArray(D.kind, [...kinds]), notInArray(D.status, ['draft', 'requested', 'cancelled', 'rejected'])));
  const PAY = schema.payments;
  const pays = await db.select().from(PAY).where(and(eq(PAY.companyId, company.id), eq(PAY.partyId, party.id)));
  // TDS deducted, discounts and write-offs settle the party's documents along with the cash.
  const A = schema.paymentAllocations;
  const adjustments = pays.length
    ? await db
        .select({ paymentId: A.paymentId, total: sql<number>`coalesce(sum(${A.tdsMinor} + ${A.discountMinor} + ${A.writeOffMinor}), 0)::bigint` })
        .from(A)
        .where(inArray(A.paymentId, pays.map((p) => p.id)))
        .groupBy(A.paymentId)
    : [];
  const adjustedOf = new Map(adjustments.map((a) => [a.paymentId, Number(a.total)]));
  const V = schema.vouchers;
  const vouchers = await db
    .select()
    .from(V)
    .where(and(eq(V.companyId, company.id), eq(V.status, 'posted'), sql`${V.lines} @> ${JSON.stringify([{ account: `party:${party.id}` }])}::jsonb`));

  // In the party's currency: as booked when they match, via base when the party is billed in base.
  const inPartyCurrency = (minor: number, cur: string, baseMinor: number) => (cur.trim() === currency ? minor : currency === baseCurrency ? baseMinor : minor);

  // Debit raises what a customer owes; credit raises what we owe a supplier.
  const entries: Entry[] = [
    ...docs.flatMap((d) => {
      const amount = inPartyCurrency(d.grandTotalMinor, d.currency, d.grandTotalBaseMinor);
      const raises = isPayableDocument(d.kind);
      const debit = supplier ? !raises : raises;
      const at = iso(d.finalizedAt ?? d.createdAt)!;
      const entry = { date: d.date, at, entityType: 'document' as const, entityId: d.id, number: d.number, debit: debit ? amount : 0, credit: debit ? 0 : amount };
      if (!d.tdsAmountMinor) return [entry];
      // TDS kept back goes to the government: it lowers what the supplier is owed (or a credit note gives it back).
      const tds = inPartyCurrency(d.tdsAmountMinor, d.currency, Math.round(d.tdsAmountMinor * Number(d.exchangeRate)));
      return [entry, { date: d.date, at, entityType: 'document' as const, entityId: d.id, number: `${d.number} TDS`, debit: debit ? 0 : tds, credit: debit ? tds : 0 }];
    }),
    ...pays.map((p) => {
      const settled = p.amountMinor + (adjustedOf.get(p.id) ?? 0);
      const amount = inPartyCurrency(settled, p.currency, Math.round(settled * Number(p.exchangeRate)));
      const debit = p.direction === 'paid';
      return { date: p.date, at: iso(p.createdAt)!, entityType: 'payment' as const, entityId: p.id, number: p.number, debit: debit ? amount : 0, credit: debit ? 0 : amount };
    }),
    // A journal on the party: a refund paid out, a balance written off, a transfer between ledgers.
    ...vouchers.flatMap((v) =>
      (v.lines as { account: string; debitMinor: number; creditMinor: number }[])
        .filter((l) => l.account === `party:${party.id}`)
        .map((l) => ({ date: v.date, at: iso(v.createdAt)!, entityType: 'voucher' as const, entityId: v.id, number: v.number, debit: l.debitMinor, credit: l.creditMinor })),
    ),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at));

  const net = (e: Entry) => (supplier ? e.credit - e.debit : e.debit - e.credit);
  let balance = party.openingBalanceMinor;
  for (const e of entries) if (range.from && e.date < range.from) balance += net(e);
  const opening = balance;

  const rows: NonNullable<Statement['entries']> = [
    {
      date: range.from ?? entries[0]?.date ?? iso(party.createdAt)!.slice(0, 10),
      entityType: 'opening',
      entityId: party.id,
      number: 'Opening balance',
      debit: money(!supplier && opening > 0 ? opening : supplier && opening < 0 ? -opening : 0, currency),
      credit: money(supplier && opening > 0 ? opening : !supplier && opening < 0 ? -opening : 0, currency),
      balance: money(opening, currency),
    },
  ];
  for (const e of entries) {
    if ((range.from && e.date < range.from) || (range.to && e.date > range.to)) continue;
    balance += net(e);
    rows.push({ date: e.date, entityType: e.entityType, entityId: e.entityId, number: e.number, debit: money(e.debit, currency), credit: money(e.credit, currency), balance: money(balance, currency) });
  }
  return { party: partyToWire(party), openingBalance: money(opening, currency), closingBalance: money(balance, currency), entries: rows };
}

export function statementHtml(company: CompanyRow, s: Statement, range: { from?: string; to?: string }): string {
  const cell = (m: Schema<'Money'> | undefined) => (m && m.minor !== 0 ? formatMoney(m) : '');
  const rows = (s.entries ?? [])
    .map((e) => `<tr><td>${formatDate(e.date ?? '')}</td><td>${esc(e.number)}</td><td class="num">${cell(e.debit)}</td><td class="num">${cell(e.credit)}</td><td class="num">${e.balance ? formatMoney(e.balance) : ''}</td></tr>`)
    .join('');
  const period = range.from || range.to ? `${range.from ? formatDate(range.from) : '…'} to ${range.to ? formatDate(range.to) : '…'}` : 'All dates';
  return printablePage(
    `Statement ${s.party?.name ?? ''}`,
    company,
    `<h1>STATEMENT OF ACCOUNT</h1>
     <div><span class="strong">${esc(s.party?.name)}</span> · ${esc(period)}</div>
     <table><thead><tr><th>Date</th><th>Particulars</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr></thead><tbody>${rows}</tbody></table>
     <p class="strong" style="text-align:right">Closing balance: ${s.closingBalance ? formatMoney(s.closingBalance) : ''}</p>`,
  );
}
