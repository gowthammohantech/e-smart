import type { Schema } from '@esmart/api-contract';
import type { schema } from '@esmart/db';
import { compact, money, versioned } from '../../lib/wire';

type TaxRow = typeof schema.taxCategories.$inferSelect;
type ExpenseCategoryRow = typeof schema.expenseCategories.$inferSelect;
type AccountRow = typeof schema.paymentAccounts.$inferSelect;
type RateRow = typeof schema.exchangeRates.$inferSelect;
type TransporterRow = typeof schema.transporters.$inferSelect;
type SeriesRow = typeof schema.numberingSeries.$inferSelect;

/** `history` is the rates it had before its current one (`taxHistories`), so a form can charge as of any date. */
export function taxCategoryToWire(row: TaxRow, history?: { effectiveFrom: string; rate: number }[]): Schema<'TaxCategory'> {
  return compact({
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    rate: Number(row.rate),
    type: row.type,
    hsnCode: row.hsnCode,
    effectiveFrom: row.effectiveFrom,
    description: row.description,
    history: history?.length ? history : undefined,
    ...versioned(row),
  });
}

export function expenseCategoryToWire(row: ExpenseCategoryRow): Schema<'ExpenseCategory'> {
  return { id: row.id, companyId: row.companyId, name: row.name, icon: row.icon, color: row.color, ...versioned(row) };
}

/** `balance` is the running balance in minor units; see `accountBalances` in core. */
/** `baseCurrency` labels the balance, which is in base; it defaults to the account's own. */
export function paymentAccountToWire(row: AccountRow, balance: number, baseCurrency?: string): Schema<'PaymentAccount'> {
  const currency = row.currency.trim();
  return compact({
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    type: row.type,
    currency,
    accountNumber: row.accountNumber,
    accountHolderName: row.accountHolderName,
    bankName: row.bankName,
    branchName: row.branchName,
    ifsc: row.ifsc,
    upiId: row.upiId,
    openingBalance: money(row.openingBalanceMinor, currency),
    openingBalanceDate: row.openingBalanceDate,
    openingRate: Number(row.openingRate) === 1 ? undefined : Number(row.openingRate),
    currentBalance: money(balance, baseCurrency ?? currency),
    isDefault: row.isDefault,
    // Without it the app takes the account for one the server hasn't seen, and an edit creates a new one.
    ...versioned(row),
  });
}

export function exchangeRateToWire(row: RateRow): Schema<'ExchangeRate'> {
  return {
    id: row.id,
    companyId: row.companyId,
    from: row.fromCurrency.trim(),
    to: row.toCurrency.trim(),
    rate: Number(row.rate),
    effectiveFrom: row.effectiveFrom,
    source: row.source,
    ...versioned(row),
  };
}

export function transporterToWire(row: TransporterRow): Schema<'Transporter'> {
  return compact({ id: row.id, companyId: row.companyId, name: row.name, transporterId: row.transporterId, phone: row.phone, status: row.status, ...versioned(row) });
}

export function seriesToWire(row: SeriesRow): Schema<'NumberingSeries'> {
  return {
    id: row.id,
    companyId: row.companyId,
    kind: row.kind,
    prefix: row.prefix,
    nextNumber: row.nextNumber,
    padding: row.padding,
    includeFiscalYear: row.includeFiscalYear,
    includeBranchCode: row.includeBranchCode,
    resetPolicy: row.resetPolicy,
    // The app only sends edits for a series it has a version for.
    ...versioned(row),
  };
}
