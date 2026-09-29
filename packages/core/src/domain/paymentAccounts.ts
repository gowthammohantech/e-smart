import { Expense, Payment, PaymentAccount, PaymentMethod } from '../types';

/**
 * Which kinds of account a payment method can settle through. Money paid by
 * bank transfer, cheque or card cannot come out of the cash drawer.
 */
export function accountTypesFor(method: PaymentMethod): PaymentAccount['type'][] {
  switch (method) {
    case 'cash':
      return ['cash'];
    case 'bank':
    case 'cheque':
    case 'card':
      return ['bank'];
    case 'upi':
      return ['bank', 'wallet'];
    case 'wallet':
      return ['wallet'];
    default:
      return ['cash', 'bank', 'wallet'];
  }
}

export function accountsForMethod(method: PaymentMethod, accounts: PaymentAccount[]): PaymentAccount[] {
  const types = accountTypesFor(method);
  return accounts.filter((a) => types.includes(a.type));
}

/** The company default when it fits the method, else the first account that does. */
export function defaultAccountFor(method: PaymentMethod, accounts: PaymentAccount[]): PaymentAccount | undefined {
  const fitting = accountsForMethod(method, accounts);
  return fitting.find((a) => a.isDefault) ?? fitting[0];
}

/** Keep the current account if it still fits the method, otherwise pick the method's default. */
export function accountIdAfterMethodChange(
  method: PaymentMethod,
  currentId: string,
  accounts: PaymentAccount[],
): string {
  const fitting = accountsForMethod(method, accounts);
  if (fitting.some((a) => a.id === currentId)) return currentId;
  return defaultAccountFor(method, accounts)?.id ?? '';
}

/** Can this method settle through this account? (Bank transfers never touch cash in hand.) */
export function accountFitsMethod(method: PaymentMethod, account: PaymentAccount | undefined): boolean {
  return !!account && accountTypesFor(method).includes(account.type);
}

/**
 * Running balance of every account, in base-currency minor units:
 * opening + money received − money paid − expenses paid from it.
 */
export function accountBalances(
  accounts: PaymentAccount[],
  payments: Payment[],
  expenses: Expense[],
): Record<string, number> {
  const map: Record<string, number> = {};
  accounts.forEach((a) => {
    map[a.id] = a.openingBalance.minor;
  });
  payments.forEach((p) => {
    if (map[p.accountId] === undefined) return;
    const delta = Math.round(p.amount.minor * (p.exchangeRate || 1));
    map[p.accountId] += p.direction === 'received' ? delta : -delta;
  });
  expenses.forEach((e) => {
    if (map[e.accountId] === undefined) return;
    map[e.accountId] -= Math.round(e.amount.minor * (e.exchangeRate || 1));
  });
  return map;
}
