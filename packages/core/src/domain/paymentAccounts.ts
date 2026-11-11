import { BankDetails, Expense, Payment, PaymentAccount, PaymentMethod, Voucher } from '../types';

/**
 * The bank details a payment account prints on invoices, as the server copies them onto the
 * company: undefined for a cash account or one with nothing a customer could pay into.
 */
export function bankDetailsOf(account: PaymentAccount | null | undefined): BankDetails | undefined {
  if (!account || account.type === 'cash') return undefined;
  const text = (v?: string) => v?.trim() || undefined;
  const out: BankDetails = {
    bankName: text(account.bankName),
    accountName: text(account.accountHolderName),
    accountNumber: text(account.accountNumber)?.replace(/\s+/g, '').toUpperCase(),
    ifsc: text(account.ifsc)?.toUpperCase(),
    branch: text(account.branchName),
    upiId: text(account.upiId)?.toLowerCase(),
  };
  for (const k of Object.keys(out) as (keyof BankDetails)[]) if (out[k] === undefined) delete out[k];
  return Object.keys(out).length ? out : undefined;
}

/** Whether an account has what a customer needs to pay into it: an account number or a UPI ID. */
export function canPrintOnInvoices(account: PaymentAccount): boolean {
  return account.type !== 'cash' && !!(account.accountNumber?.trim() || account.upiId?.trim());
}

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

/**
 * The preferred account when it fits the method (money received defaults to the bank account the invoices
 * print), else the company default when it fits, else the first account that does.
 */
export function defaultAccountFor(method: PaymentMethod, accounts: PaymentAccount[], preferredId?: string): PaymentAccount | undefined {
  const fitting = accountsForMethod(method, accounts);
  return (preferredId ? fitting.find((a) => a.id === preferredId) : undefined) ?? fitting.find((a) => a.isDefault) ?? fitting[0];
}

/** Keep the current account if it still fits the method, otherwise pick the method's default. */
export function accountIdAfterMethodChange(
  method: PaymentMethod,
  currentId: string,
  accounts: PaymentAccount[],
  preferredId?: string,
): string {
  const fitting = accountsForMethod(method, accounts);
  if (fitting.some((a) => a.id === currentId)) return currentId;
  return defaultAccountFor(method, accounts, preferredId)?.id ?? '';
}

/** Can this method settle through this account? (Bank transfers never touch cash in hand.) */
export function accountFitsMethod(method: PaymentMethod, account: Pick<PaymentAccount, 'type'> | undefined): boolean {
  return !!account && accountTypesFor(method).includes(account.type);
}

/**
 * Running balance of every account, in base-currency minor units:
 * opening + money received − money paid − expenses paid from it, and what
 * vouchers moved in or out (a contra from cash to bank, bank charges).
 */
export function accountBalances(
  accounts: PaymentAccount[],
  payments: Payment[],
  expenses: Expense[],
  vouchers: Pick<Voucher, 'lines' | 'status'>[] = [],
): Record<string, number> {
  const map: Record<string, number> = {};
  accounts.forEach((a) => {
    map[a.id] = Math.round(a.openingBalance.minor * (a.openingRate ?? 1));
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
  // A draft voucher hasn't moved any money yet.
  vouchers.filter((v) => v.status !== 'draft').forEach((v) =>
    v.lines.forEach((l) => {
      const id = l.account.startsWith('pay:') ? l.account.slice(4) : undefined;
      if (id && map[id] !== undefined) map[id] += l.debit.minor - l.credit.minor;
    }),
  );
  return map;
}
