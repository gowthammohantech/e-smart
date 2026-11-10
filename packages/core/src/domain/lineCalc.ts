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
  /** TCS collected from the buyer (s.206C), percent of the sale value with GST; added before rounding. */
  tcsRate?: number;
  /** The document's date: from CHARGES_TAXED_FROM its charges are part of the taxable value. */
  date?: string;
};

/**
 * From this date a document's charges (freight, packing, insurance, handling billed on it) are part
 * of the value of supply (CGST s.15(2)(c); s.8 for a composite supply): spread over the lines in
 * proportion to their taxable value and taxed with each line (RULES 1.10). Documents dated before it
 * keep their charges after tax, untaxed, exactly as they were issued.
 */
export const CHARGES_TAXED_FROM = '2026-12-01';

type ChargedDoc = { date?: string; lines: DocumentLine[]; charges: Money; currency: string };

/** What a line is worth before tax, for spreading the charges: after its discount, tax in an inclusive price taken out. */
function chargeWeight(line: DocumentLine, currency: string): number {
  if (line.gst?.reimbursement) return 0;
  const gross = multiply(money(line.unitPrice.minor, currency), line.quantity);
  const net = subtract(gross, discountOf(gross, line.discountMode, line.discountValue));
  const combined = (line.taxRate || 0) + (line.gst?.cessRate ?? 0);
  const value = line.taxInclusive && combined > 0 && !line.gst?.reverseCharge ? subtract(net, inclusiveTax(net, combined)) : net;
  return Math.max(value.minor, 0);
}

/**
 * Each line's share of the charges, in minor units, or null when the charges stay outside the taxable
 * value (an older document, no charges, or nothing to spread them over). Largest remainder, so the
 * shares add up to the charges to the paisa; ties go to the earlier line.
 */
export function chargeShares(doc: ChargedDoc): number[] | null {
  const total = doc.charges?.minor ?? 0;
  if (!total || !doc.date || doc.date < CHARGES_TAXED_FROM) return null;
  const weights = doc.lines.map((l) => chargeWeight(l, doc.currency));
  const weightSum = weights.reduce((a, w) => a + w, 0);
  if (weightSum <= 0) return null;
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const raw = weights.map((w) => (abs * w) / weightSum);
  const shares = raw.map(Math.floor);
  let left = abs - shares.reduce((a, x) => a + x, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).filter((x) => weights[x.i] > 0).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; left > 0 && order.length; k = (k + 1) % order.length, left--) shares[order[k].i] += 1;
  return shares.map((x) => sign * x);
}

/** The document's lines, each carrying its share of the charges when they are taxed (see CHARGES_TAXED_FROM). */
export function linesWithCharges(doc: ChargedDoc): DocumentLine[] {
  const shares = chargeShares(doc);
  if (!shares) return doc.lines;
  return doc.lines.map((l, i) => (shares[i] ? { ...l, chargeShare: money(shares[i], doc.currency) } : l));
}

/** The part of the document's charges that is inside its taxable value; zero on older documents. */
export function taxedCharges(doc: ChargedDoc): Money {
  const shares = chargeShares(doc);
  return money(shares ? shares.reduce((a, x) => a + x, 0) : 0, doc.currency);
}

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
  /** The cess part of `taxAmount`; the rest is GST. */
  cessAmount: Money;
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
  let cessAmount: Money;

  // Reverse-charge tax is never inside the supplier's price.
  if (line.taxInclusive && combined > 0 && !t.reverseCharge) {
    // The entered price already contains the tax: strip it back out.
    taxAmount = inclusiveTax(net, combined);
    taxable = subtract(net, taxAmount);
    cessAmount = money(Math.round((taxAmount.minor * t.cessRate) / combined), currency);
  } else {
    taxable = net;
    cessAmount = percent(net, t.cessRate);
    taxAmount = add(percent(net, t.rate), cessAmount);
  }

  // The line's share of the document's charges is taxed with it, on top of its own value.
  if (line.chargeShare?.minor) {
    const share = money(line.chargeShare.minor, currency);
    const shareCess = percent(share, t.cessRate);
    taxable = add(taxable, share);
    cessAmount = add(cessAmount, shareCess);
    taxAmount = add(taxAmount, add(percent(share, t.rate), shareCess));
  }

  return {
    lineId: line.id,
    gross,
    discount,
    taxable,
    taxRate: t.rate,
    cessRate: t.cessRate,
    taxAmount,
    cessAmount,
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

  // From CHARGES_TAXED_FROM the charges ride on the lines, taxed with them; only what can't be spread stays after tax.
  const charged = linesWithCharges({ date: input.date, lines: input.lines, charges, currency });
  const lines = charged;
  const taxedChargeMinor = charged === input.lines ? 0 : charged.reduce((a, l) => a + (l.chargeShare?.minor ?? 0), 0);
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
  // The document discount is on the goods and their tax, as before the charges were taxed.
  const plain = taxedChargeMinor ? calculateDocument({ ...input, charges: zero(currency), date: undefined, tcsRate: undefined, applyRoundOff: false, roundOffManual: undefined }) : undefined;
  const goodsAfterTax = plain ? add(plain.taxableAmount, plain.totalTax) : afterTax;
  const documentDiscount = discountOf(goodsAfterTax, documentDiscountMode, documentDiscountValue);

  // What is left of the charges after tax: all of them on an older document, none once they are taxed.
  const chargesInCurrency = money(charges.minor - taxedChargeMinor, currency);
  // TCS on what the buyer pays for the goods, GST included, not on pure-agent recoveries; to the rupee.
  const tcsBase = add(subtract(afterTax, documentDiscount), chargesInCurrency);
  const tcs = input.tcsRate && input.tcsRate > 0 ? money(Math.round((tcsBase.minor * input.tcsRate) / 100 / 100) * 100, currency) : undefined;
  const beforeRounding = add(add(add(subtract(afterTax, documentDiscount), reimbursements), chargesInCurrency), tcs ?? zero(currency));

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
    ...(taxedChargeMinor && { chargesTaxed: money(taxedChargeMinor, currency) }),
    ...(tcs && { tcs }),
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

/**
 * The cess rate a line shows beside its GST rate, 0 when none: only a taxable line (not exempt,
 * nil-rated, non-GST or a reimbursement) carries cess.
 */
export function shownCessRate(line: Pick<DocumentLine, 'gst'>): number {
  const g = line.gst;
  if (!g?.cessRate || g.cessRate <= 0 || g.reimbursement || (g.supplyType ?? 'taxable') !== 'taxable') return 0;
  return g.cessRate;
}
