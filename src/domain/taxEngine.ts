import { Money, allocate, money, percent, zero } from '@/lib/money';
import { TaxCategory, TaxComponent, TaxType } from '@/types';
import { isInterState } from './gst/supplyType';

export type TaxContext = {
  regime: 'GST' | 'NONE';
  /** State code the business is registered in. */
  homeStateCode?: string;
  /** State code the goods/services are supplied to. */
  placeOfSupplyStateCode?: string;
  registered: boolean;
};

/**
 * Split a combined rate into its legal components (FRD 15).
 *
 * An intra-state supply splits evenly into CGST + SGST; an inter-state supply
 * becomes a single IGST line at the full rate.
 */
export function splitTax(
  taxableAmount: Money,
  rate: number,
  ctx: TaxContext,
): TaxComponent[] {
  if (rate <= 0 || !ctx.registered) return [];

  const total = percent(taxableAmount, rate);

  if (ctx.regime === 'GST') {
    if (isInterState(ctx.homeStateCode, ctx.placeOfSupplyStateCode)) {
      return [{ type: 'IGST', label: `IGST ${rate}%`, rate, amount: total }];
    }
    // Split without losing a paisa.
    const [cgst, sgst] = allocate(total, [1, 1]);
    const half = rate / 2;
    return [
      { type: 'CGST', label: `CGST ${half}%`, rate: half, amount: cgst },
      { type: 'SGST', label: `SGST ${half}%`, rate: half, amount: sgst },
    ];
  }

  return [];
}

export function componentTotal(components: TaxComponent[], currency: string): Money {
  return components.reduce((acc, c) => money(acc.minor + c.amount.minor, currency), zero(currency));
}

export function taxTypeLabel(type: TaxType): string {
  switch (type) {
    case 'CGST':
      return 'CGST';
    case 'SGST':
      return 'SGST';
    case 'IGST':
      return 'IGST';
    case 'CESS':
      return 'Cess';
    case 'GST':
      return 'GST';
    default:
      return 'Tax';
  }
}

export function findTaxCategory(
  categories: TaxCategory[],
  id: string | undefined,
): TaxCategory | undefined {
  if (!id) return undefined;
  return categories.find((c) => c.id === id);
}

export function rateOf(categories: TaxCategory[], id: string | undefined): number {
  return findTaxCategory(categories, id)?.rate ?? 0;
}
