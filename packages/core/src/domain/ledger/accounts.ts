import { ExpenseCategory, LedgerAccount, LedgerGroup, Party, PaymentAccount } from '../../types';
import { tdsSection } from '../../data/tdsSections';

/**
 * The chart of accounts. Almost every account is derived rather than stored:
 * - system accounts (`sys:sales`, `sys:outputCgst`, `sys:tdsPayable:194C`…), the same in every book;
 * - one per party (`party:<id>`), cash or bank account (`pay:<id>`) and expense category (`exp:<id>`);
 * - and the ones a business adds itself (`acc:<id>`): rent, a loan, a fixed asset.
 * A posting names its account by this key.
 */

export type Nature = 'asset' | 'liability' | 'income' | 'expense';

export type GroupInfo = {
  nature: Nature;
  /** Shown in the trading account, above gross profit (sales, purchases, direct costs). */
  trading?: boolean;
  /** Balance-sheet side heading it rolls up into. */
  parent?: 'capital' | 'loans' | 'currentLiabilities' | 'fixedAssets' | 'investments' | 'currentAssets';
};

export const GROUPS: Record<LedgerGroup, GroupInfo> = {
  capital: { nature: 'liability', parent: 'capital' },
  reserves: { nature: 'liability', parent: 'capital' },
  loans: { nature: 'liability', parent: 'loans' },
  sundryCreditors: { nature: 'liability', parent: 'currentLiabilities' },
  dutiesTaxes: { nature: 'liability', parent: 'currentLiabilities' },
  provisions: { nature: 'liability', parent: 'currentLiabilities' },
  currentLiabilities: { nature: 'liability', parent: 'currentLiabilities' },
  fixedAssets: { nature: 'asset', parent: 'fixedAssets' },
  investments: { nature: 'asset', parent: 'investments' },
  sundryDebtors: { nature: 'asset', parent: 'currentAssets' },
  cashInHand: { nature: 'asset', parent: 'currentAssets' },
  bankAccounts: { nature: 'asset', parent: 'currentAssets' },
  stockInHand: { nature: 'asset', parent: 'currentAssets' },
  loansAdvances: { nature: 'asset', parent: 'currentAssets' },
  currentAssets: { nature: 'asset', parent: 'currentAssets' },
  salesAccounts: { nature: 'income', trading: true },
  directIncomes: { nature: 'income', trading: true },
  indirectIncomes: { nature: 'income' },
  purchaseAccounts: { nature: 'expense', trading: true },
  directExpenses: { nature: 'expense', trading: true },
  indirectExpenses: { nature: 'expense' },
};

/** The groups a business may put its own accounts in (stock is valued from the stock ledger, not posted). */
export const USER_GROUPS: LedgerGroup[] = (Object.keys(GROUPS) as LedgerGroup[]).filter((g) => g !== 'stockInHand' && g !== 'sundryDebtors' && g !== 'sundryCreditors');

export type Account = {
  key: string;
  /** English name; the app shows `books:account.<sys key>` for system accounts. */
  name: string;
  group: LedgerGroup;
  kind: 'system' | 'party' | 'cash' | 'expense' | 'custom';
  /** For a linked account: the record it mirrors. */
  refId?: string;
};

const TAX = ['Cgst', 'Sgst', 'Igst', 'Cess'] as const;
export type TaxKind = (typeof TAX)[number];

/** Every system account, by key. TDS payable has one per section, made on demand (see accountFor). */
export const SYSTEM_ACCOUNTS: Record<string, { name: string; group: LedgerGroup }> = {
  'sys:capital': { name: 'Capital', group: 'capital' },
  'sys:openingDifference': { name: 'Opening balances', group: 'capital' },
  'sys:retainedEarnings': { name: 'Profit and loss of earlier years', group: 'reserves' },
  'sys:sales': { name: 'Sales', group: 'salesAccounts' },
  'sys:purchases': { name: 'Purchases', group: 'purchaseAccounts' },
  'sys:fixedAssets': { name: 'Plant and machinery', group: 'fixedAssets' },
  // Stock is valued from the stock ledger; this only carries what was counted when the books began.
  'sys:openingStock': { name: 'Opening stock', group: 'stockInHand' },
  'sys:freightInward': { name: 'Freight and charges on purchases', group: 'directExpenses' },
  'sys:chargesRecovered': { name: 'Freight and charges recovered', group: 'indirectIncomes' },
  // Kept for books posted before reimbursements went through the asset account below.
  'sys:reimbursements': { name: 'Reimbursements recovered', group: 'indirectIncomes' },
  // A pure agent's costs (Rule 33): a billable expense waits here until the invoice that recovers it clears it.
  'sys:reimbursementsRecoverable': { name: 'Reimbursements recoverable', group: 'loansAdvances' },
  'sys:discountAllowed': { name: 'Discount allowed', group: 'indirectExpenses' },
  'sys:discountReceived': { name: 'Discount received', group: 'indirectIncomes' },
  'sys:badDebts': { name: 'Bad debts written off', group: 'indirectExpenses' },
  'sys:roundOff': { name: 'Round off', group: 'indirectExpenses' },
  'sys:fxGainLoss': { name: 'Exchange gain or loss', group: 'indirectIncomes' },
  'sys:otherIncome': { name: 'Balances written back', group: 'indirectIncomes' },
  'sys:tdsReceivable': { name: 'TDS receivable', group: 'loansAdvances' },
  'sys:tdsPayable': { name: 'TDS payable', group: 'dutiesTaxes' },
  // GST paid on advances for services, taken back as invoices adjust them.
  'sys:gstOnAdvances': { name: 'GST paid on advances', group: 'dutiesTaxes' },
  // IGST and cess on imports, assessed on the bill of entry: owed to customs until paid (a payment voucher clears it).
  'sys:customsPayable': { name: 'Customs IGST payable', group: 'dutiesTaxes' },
  ...Object.fromEntries(
    TAX.flatMap((t) => [
      [`sys:output${t}`, { name: `Output ${t.toUpperCase()}`, group: 'dutiesTaxes' as const }],
      [`sys:input${t}`, { name: `Input ${t.toUpperCase()}`, group: 'dutiesTaxes' as const }],
      [`sys:rcmPayable${t}`, { name: `${t.toUpperCase()} payable on reverse charge`, group: 'dutiesTaxes' as const }],
    ]),
  ),
};

export const TAX_KINDS = TAX;

export type Book = {
  parties: Pick<Party, 'id' | 'name' | 'kind'>[];
  paymentAccounts: Pick<PaymentAccount, 'id' | 'name' | 'type'>[];
  expenseCategories: Pick<ExpenseCategory, 'id' | 'name'>[];
  ledgerAccounts: Pick<LedgerAccount, 'id' | 'name' | 'group'>[];
};

/** The account behind a key, or undefined when nothing in this book answers to it. */
export function accountFor(key: string, book: Book): Account | undefined {
  const [prefix, id, extra] = key.split(':');
  if (prefix === 'sys') {
    if (id === 'tdsPayable' && extra) return { key, name: `TDS payable ${tdsSection(extra)?.label ?? extra}`, group: 'dutiesTaxes', kind: 'system' };
    const s = SYSTEM_ACCOUNTS[key];
    return s ? { key, ...s, kind: 'system' } : undefined;
  }
  if (prefix === 'party') {
    const p = book.parties.find((x) => x.id === id);
    return p ? { key, name: p.name, group: p.kind === 'supplier' ? 'sundryCreditors' : 'sundryDebtors', kind: 'party', refId: p.id } : undefined;
  }
  if (prefix === 'pay') {
    const a = book.paymentAccounts.find((x) => x.id === id);
    return a ? { key, name: a.name, group: a.type === 'cash' ? 'cashInHand' : 'bankAccounts', kind: 'cash', refId: a.id } : undefined;
  }
  if (prefix === 'exp') {
    const c = book.expenseCategories.find((x) => x.id === id);
    return c ? { key, name: c.name, group: 'indirectExpenses', kind: 'expense', refId: c.id } : undefined;
  }
  if (prefix === 'acc') {
    const a = book.ledgerAccounts.find((x) => x.id === id);
    return a ? { key, name: a.name, group: a.group, kind: 'custom', refId: a.id } : undefined;
  }
  return undefined;
}

/** The whole chart: system accounts, then one per party, cash or bank account, category and custom account. */
export function chartOfAccounts(book: Book): Account[] {
  return [
    ...Object.keys(SYSTEM_ACCOUNTS).map((k) => accountFor(k, book)!),
    ...book.paymentAccounts.map((a) => accountFor(`pay:${a.id}`, book)!),
    ...book.parties.map((p) => accountFor(`party:${p.id}`, book)!),
    ...book.expenseCategories.map((c) => accountFor(`exp:${c.id}`, book)!),
    ...book.ledgerAccounts.map((a) => accountFor(`acc:${a.id}`, book)!),
  ];
}

export const natureOf = (group: LedgerGroup): Nature => GROUPS[group].nature;
/** Assets and expenses are debit balances; liabilities and income credit. */
export const isDebitNature = (group: LedgerGroup) => ['asset', 'expense'].includes(natureOf(group));
