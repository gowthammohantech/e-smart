import {
  Money,
  add,
  inclusiveTax,
  money,
  multiply,
  percent,
  roundToWholeUnit,
  subtract,
  sum,
  zero,
} from '@/lib/money';
import {
  DiscountMode,
  DocumentLine,
  DocumentTotals,
  TaxCategory,
  TaxComponent,
  TaxLine,
} from '@/types';
import { TaxContext, splitTax } from './taxEngine';

export type LineCalcInput = {
  lines: DocumentLine[];
  currency: string;
  baseCurrency: string;
  exchangeRate: number;
  documentDiscountMode: DiscountMode;
  documentDiscountValue: number;
  charges: Money;
  applyRoundOff: boolean;
  /** Signed manual adjustment; overrides the automatic round-off. */
  roundOffManual?: Money;
  taxCategories: TaxCategory[];
  taxContext: TaxContext;
};

export type LineBreakdown = {
  lineId: string;
  /** quantity x unit price, before any discount. */
  gross: Money;
  discount: Money;
  /** Amount the tax is charged on. */
  taxable: Money;
  taxRate: number;
  taxAmount: Money;
  /** taxable + tax */
  total: Money;
};

function discountOf(base: Money, mode: DiscountMode, value: number): Money {
  if (!value || value <= 0) return zero(base.currency);
  if (mode === 'percent') {
    const capped = Math.min(value, 100);
    return percent(base, capped);
  }
  const asMoney = money(Math.round(value * Math.pow(10, base.currency === 'JPY' ? 0 : 2)), base.currency);
  return asMoney.minor > base.minor ? base : asMoney;
}

/**
 * Compute a single line following the FRD 10 order:
 *   quantity x unit price -> line discount -> taxable amount -> tax
 */
export function calculateLine(line: DocumentLine, currency: string, ctx: TaxContext): LineBreakdown {
  const gross = multiply(money(line.unitPrice.minor, currency), line.quantity);
  const discount = discountOf(gross, line.discountMode, line.discountValue);
  const net = subtract(gross, discount);

  let taxable: Money;
  let taxAmount: Money;

  if (line.taxInclusive && line.taxRate > 0) {
    // The entered price already contains the tax: strip it back out.
    taxAmount = inclusiveTax(net, line.taxRate);
    taxable = subtract(net, taxAmount);
  } else {
    taxable = net;
    taxAmount = ctx.registered ? percent(net, line.taxRate) : zero(currency);
  }

  return {
    lineId: line.id,
    gross,
    discount,
    taxable,
    taxRate: line.taxRate,
    taxAmount,
    total: add(taxable, taxAmount),
  };
}

/**
 * Full document calculation (FRD 10).
 *
 * Order: line amount -> line discount -> taxable -> tax -> document discount
 * -> charges -> round off -> grand total. The document-level discount is
 * applied after tax exactly as the FRD specifies.
 */
export function calculateDocument(input: LineCalcInput): DocumentTotals {
  const {
    lines,
    currency,
    baseCurrency,
    exchangeRate,
    documentDiscountMode,
    documentDiscountValue,
    charges,
    applyRoundOff,
    roundOffManual,
    taxContext,
  } = input;

  const breakdowns = lines.map((l) => calculateLine(l, currency, taxContext));

  const subtotal = sum(breakdowns.map((b) => b.gross), currency);
  const lineDiscount = sum(breakdowns.map((b) => b.discount), currency);
  const taxableAmount = sum(breakdowns.map((b) => b.taxable), currency);

  // Group tax by rate so the document shows one row per slab.
  const groups = new Map<string, { rate: number; taxable: Money; categoryId: string }>();
  lines.forEach((line, i) => {
    const b = breakdowns[i];
    if (b.taxRate <= 0) return;
    const key = `${line.taxCategoryId}:${b.taxRate}`;
    const existing = groups.get(key);
    if (existing) {
      existing.taxable = add(existing.taxable, b.taxable);
    } else {
      groups.set(key, { rate: b.taxRate, taxable: b.taxable, categoryId: line.taxCategoryId });
    }
  });

  const taxLines: TaxLine[] = [];
  groups.forEach((g, key) => {
    const category = input.taxCategories.find((c) => c.id === g.categoryId);
    const components: TaxComponent[] = splitTax(g.taxable, g.rate, taxContext);
    const totalTax = sum(components.map((c) => c.amount), currency);
    taxLines.push({
      categoryId: g.categoryId,
      categoryName: category?.name ?? `${g.rate}%`,
      rate: g.rate,
      taxableAmount: g.taxable,
      components,
      totalTax,
    });
    void key;
  });
  taxLines.sort((a, b) => a.rate - b.rate);

  const totalTax = sum(taxLines.map((t) => t.totalTax), currency);

  const afterTax = add(taxableAmount, totalTax);
  const documentDiscount = discountOf(afterTax, documentDiscountMode, documentDiscountValue);

  const chargesInCurrency = money(charges.minor, currency);
  const beforeRounding = add(subtract(afterTax, documentDiscount), chargesInCurrency);

  const manual = roundOffManual ? money(roundOffManual.minor, currency) : undefined;
  const { rounded, adjustment } = !applyRoundOff
    ? { rounded: beforeRounding, adjustment: zero(currency) }
    : manual
      ? { rounded: add(beforeRounding, manual), adjustment: manual }
      : roundToWholeUnit(beforeRounding);

  const grandTotalBase =
    currency === baseCurrency
      ? money(rounded.minor, baseCurrency)
      : money(Math.round(rounded.minor * (exchangeRate || 1)), baseCurrency);

  return {
    subtotal,
    lineDiscount,
    documentDiscount,
    taxableAmount,
    taxLines,
    totalTax,
    charges: chargesInCurrency,
    roundOff: adjustment,
    grandTotal: rounded,
    grandTotalBase,
  };
}

/** Flatten the per-rate tax lines into one row per legal component. */
export function flattenTaxComponents(taxLines: TaxLine[], currency: string): TaxComponent[] {
  const byLabel = new Map<string, TaxComponent>();
  taxLines.forEach((tl) => {
    tl.components.forEach((c) => {
      const existing = byLabel.get(c.label);
      if (existing) {
        existing.amount = money(existing.amount.minor + c.amount.minor, currency);
      } else {
        byLabel.set(c.label, { ...c, amount: money(c.amount.minor, currency) });
      }
    });
  });
  return Array.from(byLabel.values());
}
