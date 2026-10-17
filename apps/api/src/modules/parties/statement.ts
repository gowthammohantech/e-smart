import { and, eq, inArray, notInArray } from 'drizzle-orm';
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
type Entry = { date: string; at: string; entityType: 'document' | 'payment'; entityId: string; number: string; debit: number; credit: number };

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
  const kinds = supplier ? (['purchaseBill', 'purchaseReturn'] as const) : (['invoice', 'salesReturn'] as const);
  const docs = await db
    .select()
    .from(D)
    .where(and(eq(D.companyId, company.id), eq(D.partyId, party.id), inArray(D.kind, [...kinds]), notInArray(D.status, ['draft', 'requested', 'cancelled', 'rejected'])));
  const PAY = schema.payments;
  const pays = await db.select().from(PAY).where(and(eq(PAY.companyId, company.id), eq(PAY.partyId, party.id)));

  // In the party's currency: as booked when they match, via base when the party is billed in base.
  const inPartyCurrency = (minor: number, cur: string, baseMinor: number) => (cur.trim() === currency ? minor : currency === baseCurrency ? baseMinor : minor);

  // Debit raises what a customer owes; credit raises what we owe a supplier.
  const entries: Entry[] = [
    ...docs.map((d) => {
      const amount = inPartyCurrency(d.grandTotalMinor, d.currency, d.grandTotalBaseMinor);
      const raises = d.kind === 'invoice' || d.kind === 'purchaseBill';
      const debit = supplier ? !raises : raises;
      return { date: d.date, at: iso(d.finalizedAt ?? d.createdAt)!, entityType: 'document' as const, entityId: d.id, number: d.number, debit: debit ? amount : 0, credit: debit ? 0 : amount };
    }),
    ...pays.map((p) => {
      const amount = inPartyCurrency(p.amountMinor, p.currency, Math.round(p.amountMinor * Number(p.exchangeRate)));
      const debit = p.direction === 'paid';
      return { date: p.date, at: iso(p.createdAt)!, entityType: 'payment' as const, entityId: p.id, number: p.number, debit: debit ? amount : 0, credit: debit ? 0 : amount };
    }),
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
