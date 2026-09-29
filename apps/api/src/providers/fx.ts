import type { Config } from '../config';
import { upstream } from '../http/errors';

/**
 * Exchange rates for refreshExchangeRates. `rates` answers how many units of
 * `base` one unit of each currency buys on `date`; a currency the provider
 * has no rate for is left out rather than guessed.
 */
export interface FxProvider {
  readonly name: string;
  rates(base: string, currencies: string[], date: string): Promise<Record<string, number>>;
}

/**
 * Fixed reference rates against the rupee, roughly mid-2026 levels. Enough
 * for development and tests; they never move, so they are not for real books.
 */
const INR_PER_UNIT: Record<string, number> = {
  INR: 1,
  USD: 83.5,
  EUR: 90.2,
  GBP: 105.6,
  AED: 22.73,
  SAR: 22.26,
  QAR: 22.93,
  OMR: 216.9,
  KWD: 271.8,
  BHD: 221.5,
  SGD: 61.9,
  HKD: 10.69,
  JPY: 0.556,
  CNY: 11.52,
  AUD: 55.1,
  NZD: 50.6,
  CAD: 61.3,
  CHF: 94.8,
  MYR: 17.8,
  THB: 2.31,
  ZAR: 4.52,
  LKR: 0.278,
  NPR: 0.625,
  BDT: 0.71,
};

/** Rounded to the eight decimals `exchange_rates.rate` stores. */
const round8 = (n: number) => Math.round(n * 1e8) / 1e8;

/** Cross rates through a common pivot: `perPivot[c]` is units of c per pivot unit. */
function crossRates(base: string, currencies: string[], unitsPerPivot: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  const b = unitsPerPivot[base];
  if (!b) return out;
  for (const c of currencies) {
    const u = unitsPerPivot[c];
    if (u && c !== base) out[c] = round8(b / u);
  }
  return out;
}

class StaticFxProvider implements FxProvider {
  readonly name = 'static';
  async rates(base: string, currencies: string[]) {
    // INR_PER_UNIT is pivot-per-unit; invert it to units-per-pivot.
    const perInr = Object.fromEntries(Object.entries(INR_PER_UNIT).map(([c, v]) => [c, 1 / v]));
    return crossRates(base, currencies, perInr);
  }
}

/** Open Exchange Rates: USD-based on every plan, so other bases are crossed through USD. */
class OpenExchangeRatesProvider implements FxProvider {
  readonly name = 'openexchangerates';
  constructor(private readonly appId: string) {}

  async rates(base: string, currencies: string[], date: string) {
    const today = new Date().toISOString().slice(0, 10);
    const path = date >= today ? 'latest.json' : `historical/${date}.json`;
    const symbols = [...new Set([base, ...currencies, 'USD'])].join(',');
    const url = `https://openexchangerates.org/api/${path}?app_id=${encodeURIComponent(this.appId)}&symbols=${symbols}`;
    let res: Response;
    try {
      res = await fetch(url);
    } catch (err) {
      throw upstream('FX_PROVIDER_UNAVAILABLE', `Could not reach Open Exchange Rates: ${(err as Error).message}`);
    }
    if (!res.ok) throw upstream('FX_PROVIDER_ERROR', `Open Exchange Rates answered ${res.status}`);
    const body = (await res.json()) as { rates?: Record<string, number> };
    return crossRates(base, currencies, body.rates ?? {});
  }
}

export function createFxProvider(config: Config): FxProvider {
  if (config.FX_PROVIDER === 'openexchangerates') {
    if (!config.OPENEXCHANGERATES_APP_ID) throw new Error('FX_PROVIDER=openexchangerates needs OPENEXCHANGERATES_APP_ID.');
    return new OpenExchangeRatesProvider(config.OPENEXCHANGERATES_APP_ID);
  }
  return new StaticFxProvider();
}
