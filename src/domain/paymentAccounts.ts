import { PaymentAccount, PaymentMethod } from '@/types';

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
