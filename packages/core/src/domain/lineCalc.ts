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
} from '../lib/money';
import {
  DiscountMode,
  DocumentLine,
  DocumentTotals,
  TaxCategory,
  TaxComponent,
  TaxLine,
} from '../types';
import { TaxContext, cessComponent, splitTax } from './taxEngine';

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
  cessRate: number;
  /** GST and cess on the line, reverse-charge tax included. */
  taxAmount: Money;
  /** The buyer pays this line's tax to the government; it isn't in `total`. */
  reverseCharge: boolean;
  /** A pure-agent reimbursement: no tax, outside the taxable value. */
  reimbursement: boolean;
  /** taxable + tax charged on the document */
  total: Money;
};

/**
 * The GST treatment of one line in this context: which rates apply, and whether the tax is
 * charged on the document or paid by the buyer under reverse charge.
 */
export function lineTreatment(line: DocumentLine, ctx: TaxContext) {
  const g = line.gst ?? {};
  const reimbursement = !!g.reimbursement;
  const taxable = !reimbursement && (g.supplyType ?? 'taxable') === 'taxable';
  const reverseCharge = taxable && (!!ctx.reverseCharge || !!g.reverseCharge);
  // Reverse charge is self-assessed, imports of services included (IGST, s.5(3) IGST Act).
  const effective: TaxContext = reverseCharge ? { ...ctx, zeroRated: false, composition: false } : ctx;
  const charges = taxable && effective.registered && !effective.zeroRated && !effective.composition;
  return {
    reimbursement,
    reverseCharge,
    ctx: effective,
    rate: charges ? line.taxRate : 0,
    cessRate: charges ? (g.cessRate ?? 0) : 0,
  };
}

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
  const t = lineTreatment(line, ctx);
  const combined = t.rate + t.cessRate;

  let taxable: Money;
  let taxAmount: Money;

  // Reverse-charge tax is never inside the supplier's price.
  if (line.taxInclusive && combined > 0 && !t.reverseCharge) {
    // The entered price already contains the tax: strip it back out.
    taxAmount = inclusiveTax(net, combined);
    taxable = subtract(net, taxAmount);
  } else {
    taxable = net;
    taxAmount = add(percent(net, t.rate), percent(net, t.cessRate));
  }

  return {
    lineId: line.id,
    gross,
    discount,
    taxable,
    taxRate: t.rate,
    cessRate: t.cessRate,
    taxAmount,
    reverseCharge: t.reverseCharge,
    reimbursement: t.reimbursement,
    total: t.reverseCharge ? taxable : add(taxable, taxAmount),
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
  // Reimbursements are recovered at cost, after tax: outside the subtotal, discounts and taxable value.
  const supplies = breakdowns.filter((b) => !b.reimbursement);

  const subtotal = sum(supplies.map((b) => b.gross), currency);
  const lineDiscount = sum(supplies.map((b) => b.discount), currency);
  const taxableAmount = sum(supplies.map((b) => b.taxable), currency);
  const reimbursements = sum(breakdowns.filter((b) => b.reimbursement).map((b) => b.taxable), currency);

  // Group tax by rate so the document shows one row per slab; reverse charge in rows of its own.
  const groups = new Map<string, { rate: number; cessRate: number; reverseCharge: boolean; taxable: Money; categoryId: string; ctx: TaxContext }>();
  lines.forEach((line, i) => {
    const b = breakdowns[i];
    if (b.taxRate <= 0 && b.cessRate <= 0) return;
    const key = `${line.taxCategoryId}:${b.taxRate}:${b.cessRate}:${b.reverseCharge ? 'rcm' : ''}`;
    const existing = groups.get(key);
    if (existing) {
      existing.taxable = add(existing.taxable, b.taxable);
    } else {
      const ctx = lineTreatment(line, taxContext).ctx;
      groups.set(key, { rate: b.taxRate, cessRate: b.cessRate, reverseCharge: b.reverseCharge, taxable: b.taxable, categoryId: line.taxCategoryId, ctx });
    }
  });

  const taxLines: TaxLine[] = [];
  groups.forEach((g) => {
    const category = input.taxCategories.find((c) => c.id === g.categoryId);
    const components: TaxComponent[] = [...splitTax(g.taxable, g.rate, g.ctx), ...cessComponent(g.taxable, g.cessRate, g.ctx)];
    const totalTax = sum(components.map((c) => c.amount), currency);
    taxLines.push({
      categoryId: g.categoryId,
      categoryName: category?.name ?? `${g.rate}%`,
      rate: g.rate,
      ...(g.reverseCharge ? { reverseCharge: true } : {}),
      taxableAmount: g.taxable,
      components,
      totalTax,
    });
  });
  taxLines.sort((a, b) => Number(!!a.reverseCharge) - Number(!!b.reverseCharge) || a.rate - b.rate);

  const totalTax = sum(taxLines.filter((t) => !t.reverseCharge).map((t) => t.totalTax), currency);
  const reverseChargeTax = sum(taxLines.filter((t) => t.reverseCharge).map((t) => t.totalTax), currency);

  const afterTax = add(taxableAmount, totalTax);
  const documentDiscount = discountOf(afterTax, documentDiscountMode, documentDiscountValue);

  const chargesInCurrency = money(charges.minor, currency);
  const beforeRounding = add(add(subtract(afterTax, documentDiscount), reimbursements), chargesInCurrency);

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
    reverseChargeTax,
    reimbursements,
    charges: chargesInCurrency,
    roundOff: adjustment,
    grandTotal: rounded,
    grandTotalBase,
  };
}

/** Flatten the per-rate tax lines into one row per legal component. */
export function flattenTaxComponents(taxLines: TaxLine[], currency: string): TaxComponent[] {
  const byLabel = new Map<string, TaxComponent>();
  taxLines.filter((tl) => !tl.reverseCharge).forEach((tl) => {
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
