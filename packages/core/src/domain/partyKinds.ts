import type { PartyKind } from '../types';

/**
 * What a party's kind lets it do. A party that is `both` buys and sells under one ledger, kept in
 * Sundry Debtors as Tally keeps it; a `general` contact (a landlord, the auditor, a transporter) has
 * no ledger and is on no document or payment.
 */

/** On sales documents and money received: customers and parties that are both. */
export const sellsTo = (kind: PartyKind): boolean => kind === 'customer' || kind === 'both';

/** On purchase documents, expenses and money paid: suppliers and parties that are both. */
export const buysFrom = (kind: PartyKind): boolean => kind === 'supplier' || kind === 'both';

/** Has a ledger: everyone but a general contact. */
export const hasLedger = (kind: PartyKind): boolean => kind !== 'general';

export type BalanceSide = 'dr' | 'cr';

/** The side an opening balance is on when the party doesn't say: what a supplier is owed is a credit. */
export const usualSide = (kind: PartyKind): BalanceSide => (kind === 'supplier' ? 'cr' : 'dr');

/** The opening balance as a ledger amount: debit positive (they owe us), credit negative (we owe them). */
export function openingDebit(p: { kind: PartyKind; openingBalance: { minor: number }; openingBalanceSide?: BalanceSide }): number {
  if (!hasLedger(p.kind)) return 0;
  return (p.openingBalanceSide ?? usualSide(p.kind)) === 'dr' ? p.openingBalance.minor : -p.openingBalance.minor;
}

/**
 * The opening balance as one side's outstanding: on the customer side what they owe us, on the
 * supplier side what we owe them. A one-sided party's opposite-side opening comes out negative, which
 * the balance reads as an advance (`applyOpening`); a party that is both carries it on its own side only.
 */
export function openingOnSide(p: { kind: PartyKind; openingBalance: { minor: number }; openingBalanceSide?: BalanceSide }, side: 'customer' | 'supplier'): number {
  const debit = openingDebit(p);
  if (p.kind === 'both') return side === 'customer' ? Math.max(debit, 0) : Math.max(-debit, 0);
  return side === 'customer' ? debit : -debit;
}
