import { ExchangeRate } from '@/types';
import { Money, money, subtract } from '@/lib/money';

/**
 * Resolve the rate to convert `from` into `to` on a given date (FRD 6).
 * The most recent rate whose effective date is on or before the document date
 * wins, so historical documents stay reproducible.
 */
export function resolveRate(
  rates: ExchangeRate[],
  from: string,
  to: string,
  onDate: string,
): number {
  if (from === to) return 1;

  const direct = rates
    .filter((r) => r.from === from && r.to === to && r.effectiveFrom <= onDate)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  if (direct) return direct.rate;

  const inverse = rates
    .filter((r) => r.from === to && r.to === from && r.effectiveFrom <= onDate)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  if (inverse && inverse.rate !== 0) return 1 / inverse.rate;

  return 1;
}

export function convert(amount: Money, to: string, rate: number): Money {
  if (amount.currency === to) return amount;
  return money(Math.round(amount.minor * rate), to);
}

/**
 * FX gain/loss recognised when a foreign-currency invoice settles at a
 * different rate from the one stored on the document.
 */
export function settlementGainLoss(
  amountInDocCurrency: Money,
  documentRate: number,
  settlementRate: number,
  baseCurrency: string,
): Money {
  const atDocRate = money(Math.round(amountInDocCurrency.minor * documentRate), baseCurrency);
  const atSettlement = money(Math.round(amountInDocCurrency.minor * settlementRate), baseCurrency);
  return subtract(atSettlement, atDocRate);
}

export function rateHistory(rates: ExchangeRate[], from: string, to: string): ExchangeRate[] {
  return rates
    .filter((r) => (r.from === from && r.to === to) || (r.from === to && r.to === from))
    .slice()
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
}
