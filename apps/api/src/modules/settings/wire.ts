import type { Schema } from '@esmart/api-contract';
import type { schema } from '@esmart/db';
import { compact, money } from '../../lib/wire';

type TaxRow = typeof schema.taxCategories.$inferSelect;
type ExpenseCategoryRow = typeof schema.expenseCategories.$inferSelect;
type AccountRow = typeof schema.paymentAccounts.$inferSelect;
type RateRow = typeof schema.exchangeRates.$inferSelect;
type TransporterRow = typeof schema.transporters.$inferSelect;
type SeriesRow = typeof schema.numberingSeries.$inferSelect;

export function taxCategoryToWire(row: TaxRow): Schema<'TaxCategory'> {
  return compact({
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    rate: Number(row.rate),
    type: row.type,
    hsnCode: row.hsnCode,
    effectiveFrom: row.effectiveFrom,
    description: row.description,
  });
}

export function expenseCategoryToWire(row: ExpenseCategoryRow): Schema<'ExpenseCategory'> {
  return { id: row.id, companyId: row.companyId, name: row.name, icon: row.icon, color: row.color };
}

/** `balance` is the running balance in minor units; see `accountBalances` in core. */
export function paymentAccountToWire(row: AccountRow, balance: number): Schema<'PaymentAccount'> {
  const currency = row.currency.trim();
  return compact({
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    type: row.type,
    currency,
    accountNumber: row.accountNumber,
    openingBalance: money(row.openingBalanceMinor, currency),
    currentBalance: money(balance, currency),
    isDefault: row.isDefault,
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
  };
}

export function transporterToWire(row: TransporterRow): Schema<'Transporter'> {
  return compact({ id: row.id, companyId: row.companyId, name: row.name, transporterId: row.transporterId, phone: row.phone, status: row.status });
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
  };
}
