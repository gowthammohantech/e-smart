export type CurrencyMeta = {
  code: string;
  name: string;
  symbol: string;
  precision: number;
  /** Indian grouping (1,23,456.78) vs western (123,456.78). */
  grouping: 'indian' | 'western';
};

export const CURRENCIES: CurrencyMeta[] = [
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', precision: 2, grouping: 'indian' },
  { code: 'USD', name: 'US Dollar', symbol: '$', precision: 2, grouping: 'western' },
  { code: 'EUR', name: 'Euro', symbol: '€', precision: 2, grouping: 'western' },
  { code: 'GBP', name: 'Pound Sterling', symbol: '£', precision: 2, grouping: 'western' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED', precision: 2, grouping: 'western' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', precision: 2, grouping: 'western' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', precision: 2, grouping: 'western' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', precision: 2, grouping: 'western' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', precision: 0, grouping: 'western' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: 'SAR', precision: 2, grouping: 'western' },
];

const byCode = new Map(CURRENCIES.map((c) => [c.code, c]));

export function currencyMeta(code: string): CurrencyMeta {
  return (
    byCode.get(code) ?? {
      code,
      name: code,
      symbol: code,
      precision: 2,
      grouping: 'western',
    }
  );
}

export function currencySymbol(code: string): string {
  return currencyMeta(code).symbol;
}
