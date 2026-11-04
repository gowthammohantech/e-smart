import { eq } from 'drizzle-orm';
import { accountFor, type Account } from '@esmart/core/domain/ledger/accounts';
import type { Posting } from '@esmart/core/domain/ledger/postings';
import { stateNameOf } from '@esmart/core/domain/stateCodes';
import { tdsSection } from '@esmart/core/data/tdsSections';
import type { LedgerGroup } from '@esmart/core/types';
import { schema } from '@esmart/db';
import type { AuthUser, CompanyRow } from '../../context';
import type { DbOrTx } from '../../lib/audit';
import { loadBook } from '../books/book';

/** Tally's reserved group for each of ours, so a CA's import lands in the groups they expect. */
const TALLY_GROUP: Record<LedgerGroup, string> = {
  capital: 'Capital Account',
  reserves: 'Reserves & Surplus',
  loans: 'Loans (Liability)',
  sundryCreditors: 'Sundry Creditors',
  dutiesTaxes: 'Duties & Taxes',
  provisions: 'Provisions',
  currentLiabilities: 'Current Liabilities',
  fixedAssets: 'Fixed Assets',
  investments: 'Investments',
  sundryDebtors: 'Sundry Debtors',
  cashInHand: 'Cash-in-Hand',
  bankAccounts: 'Bank Accounts',
  stockInHand: 'Stock-in-Hand',
  loansAdvances: 'Loans & Advances (Asset)',
  currentAssets: 'Current Assets',
  salesAccounts: 'Sales Accounts',
  directIncomes: 'Direct Incomes',
  indirectIncomes: 'Indirect Incomes',
  purchaseAccounts: 'Purchase Accounts',
  directExpenses: 'Direct Expenses',
  indirectExpenses: 'Indirect Expenses',
};

/** The Tally voucher type each source becomes. */
function voucherType(source: Posting['source'], debitsParty: boolean): string {
  if (source.type === 'document') {
    if (source.kind === 'invoice' || source.kind === 'debitNote') return 'Sales';
    if (source.kind === 'purchaseBill' || source.kind === 'supplierDebitNote') return 'Purchase';
    if (source.kind === 'creditNote' || source.kind === 'salesReturn') return 'Credit Note';
    return 'Debit Note';
  }
  if (source.type === 'payment') return debitsParty ? 'Payment' : 'Receipt';
  if (source.type === 'expense') return 'Payment';
  if (source.kind === 'contra') return 'Contra';
  if (source.kind === 'tdsChallan') return 'Payment';
  if (source.kind === 'receipt') return 'Receipt';
  return 'Journal';
}

const xml = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
const amount = (minor: number) => (minor / 100).toFixed(2);
const tallyDate = (iso: string) => iso.replaceAll('-', '');

/**
 * The books in Tally's import envelope, from the same postings the trial balance is built from:
 * a ledger master for every account (under Tally's reserved groups, with GSTIN, state and opening
 * balance as at `from`), then every sale, purchase, note, receipt, payment, expense and voucher in
 * the range. Tally's sign convention: a debit is negative with ISDEEMEDPOSITIVE Yes.
 */
export async function tallyXml(db: DbOrTx, companyId: string, opts: { from?: string; to?: string }, now: Date): Promise<{ body: Buffer; contentType: string; extension: string }> {
  const [company] = (await db.select().from(schema.companies).where(eq(schema.companies.id, companyId))) as CompanyRow[];
  const to = opts.to ?? '9999-12-31';
  const from = opts.from ?? '1900-01-01';
  const { postings, book } = await loadBook({ db, company, user: { branchIds: [] } as unknown as AuthUser, now, from, to });
  const parties = new Map((await db.select({ id: schema.parties.id, gstin: schema.parties.taxId, state: schema.parties.billingStateCode }).from(schema.parties).where(eq(schema.parties.companyId, companyId))).map((p) => [p.id, p]));

  // One name per account; Tally names are unique, so a clash gets the account's kind added.
  const names = new Map<string, string>();
  const used = new Set<string>();
  const accountOf = (key: string): Account => accountFor(key, book) ?? { key, name: key, group: 'suspense' as never, kind: 'system' };
  const nameOf = (key: string) => {
    if (names.has(key)) return names.get(key)!;
    const a = accountOf(key);
    const [, , section] = key.split(':');
    let name = key.startsWith('sys:tdsPayable:') ? `TDS payable ${tdsSection(section)?.label ?? section}` : a.name;
    if (used.has(name)) name = `${name} (${key.split(':')[0]})`;
    for (let i = 2; used.has(name); i++) name = `${a.name} ${i}`;
    used.add(name);
    names.set(key, name);
    return name;
  };

  // Opening as at `from`: the opening balances, plus everything posted before the range.
  const opening = new Map<string, number>();
  for (const p of postings) if (p.source.type === 'opening' || p.date < from) opening.set(p.account, (opening.get(p.account) ?? 0) + p.debit - p.credit);
  const keys = [...new Set(postings.map((p) => p.account))].sort();
  const masters = keys.map((key) => {
    const a = accountOf(key);
    const party = key.startsWith('party:') ? parties.get(key.slice(6)) : undefined;
    const group = TALLY_GROUP[a.group as LedgerGroup] ?? 'Suspense A/c';
    const open = opening.get(key) ?? 0;
    return (
      `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${xml(nameOf(key))}" ACTION="Create"><NAME.LIST><NAME>${xml(nameOf(key))}</NAME></NAME.LIST>` +
      `<PARENT>${xml(group)}</PARENT>` +
      (party?.gstin ? `<PARTYGSTIN>${xml(party.gstin)}</PARTYGSTIN><GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>` : '') +
      (party?.state ? `<LEDSTATENAME>${xml(stateNameOf(party.state))}</LEDSTATENAME>` : '') +
      (open ? `<OPENINGBALANCE>${amount(-open)}</OPENINGBALANCE>` : '') +
      `</LEDGER></TALLYMESSAGE>`
    );
  });

  // A voucher per source and date: an advance's tax is taken back on the invoice's day.
  const groups = new Map<string, Posting[]>();
  for (const p of postings) {
    if (p.source.type === 'opening' || p.date < from || p.date > to) continue;
    const k = `${p.source.type}:${p.source.id}:${p.date}`;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  const vouchers = [...groups.values()].map((ps) => {
    const { source, date } = ps[0];
    const party = ps.find((p) => p.account.startsWith('party:'));
    const type = voucherType(source, !!party && party.debit > 0);
    const remoteId = ps.some((p) => p.date !== date) || [...groups.keys()].filter((k) => k.startsWith(`${source.type}:${source.id}:`)).length > 1 ? `${source.id}-${date}` : source.id;
    const lines = ps.map(
      (p) =>
        `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${xml(nameOf(p.account))}</LEDGERNAME><ISDEEMEDPOSITIVE>${p.debit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>` +
        `${p.account.startsWith('party:') ? '<ISPARTYLEDGER>Yes</ISPARTYLEDGER>' : ''}<AMOUNT>${amount(p.debit ? -p.debit : p.credit)}</AMOUNT></ALLLEDGERENTRIES.LIST>`,
    );
    return (
      `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${type}" ACTION="Create" REMOTEID="${xml(remoteId)}">` +
      `<DATE>${tallyDate(date)}</DATE><VOUCHERTYPENAME>${type}</VOUCHERTYPENAME><VOUCHERNUMBER>${xml(source.number)}</VOUCHERNUMBER>` +
      (party ? `<PARTYLEDGERNAME>${xml(nameOf(party.account))}</PARTYLEDGERNAME>` : '') +
      `<PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>${lines.join('')}</VOUCHER></TALLYMESSAGE>`
    );
  });

  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA>' +
    `<REQUESTDESC><REPORTNAME>All Masters</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${xml(company?.name)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC>` +
    `<REQUESTDATA>${[...masters, ...vouchers].join('\n')}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>\n`;
  return { body: Buffer.from(body), contentType: 'application/xml', extension: 'xml' };
}
