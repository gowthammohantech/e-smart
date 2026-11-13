import { Money, allocate, money, percent, zero } from '../lib/money';
import { Branch, Company, Party, TaxCategory, TaxComponent, TaxType } from '../types';
import { OTHER_COUNTRY_CODE } from './stateCodes';

export type TaxContext = {
  regime: 'GST' | 'VAT' | 'NONE';
  /** State code the business is registered in. */
  homeStateCode?: string;
  /** State code the goods/services are supplied to. */
  placeOfSupplyStateCode?: string;
  registered: boolean;
  /**
   * A cross-border or SEZ supply. It is always inter-state (IGST), even when
   * the SEZ sits in the business's own state.
   */
  crossBorder?: 'export' | 'sez' | 'import';
  /** No GST on the document: an export or SEZ supply without tax (LUT or bond), or an import bill without. */
  zeroRated?: boolean;
  /** A sale by a composition dealer: a bill of supply, which may not charge GST (s.10(4)). */
  composition?: boolean;
  /** The whole document is under reverse charge: the buyer pays the GST. */
  reverseCharge?: boolean;
};

/** Is the company's Letter of Undertaking in force on `date`? */
export function lutActive(company: Company | undefined, date: string): boolean {
  const reg = company?.taxRegistration;
  if (!reg?.registered || reg.regime !== 'GST' || !reg.lutNumber) return false;
  return !reg.lutValidTill || date <= reg.lutValidTill;
}

/**
 * Whether an export, a supply with an SEZ unit or developer, or an import bill charges IGST, or goes
 * without: zero-rated under LUT or bond, or (an import) with the IGST paid at customs instead.
 */
export type CrossBorderTax = 'withTax' | 'withoutTax';

/**
 * What a cross-border document does when nobody has chosen: an export or SEZ sale goes without tax
 * while the business's LUT is in force and with IGST otherwise; a bill from an SEZ supplier charges
 * IGST; an import bill charges none (IGST on goods is paid at customs, on the bill of entry).
 */
export function defaultCrossBorderTax(company: Company | undefined, date: string, purchase: boolean, crossBorder: NonNullable<TaxContext['crossBorder']> = 'sez'): CrossBorderTax {
  if (crossBorder === 'import') return 'withoutTax';
  return !purchase && lutActive(company, date) ? 'withoutTax' : 'withTax';
}

/**
 * The tax context for one document: the company's registration, the place of
 * supply, and whether the party makes it an export, SEZ supply or import. Any
 * of those charges IGST or not as `crossBorderTax` says, else as `defaultCrossBorderTax`.
 */
export function buildTaxContext(
  company: Company | undefined,
  opts: { placeOfSupply?: string; party?: Party; date: string; purchase: boolean; branch?: Branch; reverseCharge?: boolean; crossBorderTax?: CrossBorderTax | null },
): TaxContext {
  const reg = company?.taxRegistration;
  // A branch with its own GSTIN supplies from that state; its first two digits are the state code.
  const home = homeStateCode(company, opts.branch);
  const pos = opts.placeOfSupply ?? home;
  const abroad = opts.party?.gstRegistrationType === 'overseas' || pos === OTHER_COUNTRY_CODE;
  const crossBorder: TaxContext['crossBorder'] = abroad
    ? opts.purchase
      ? 'import'
      : 'export'
    : opts.party?.gstRegistrationType === 'sez'
      ? 'sez'
      : undefined;
  return {
    regime: reg?.regime ?? 'NONE',
    homeStateCode: home,
    placeOfSupplyStateCode: pos,
    registered: !!reg?.registered,
    crossBorder,
    zeroRated: !!crossBorder && (opts.crossBorderTax ?? defaultCrossBorderTax(company, opts.date, opts.purchase, crossBorder)) === 'withoutTax',
    composition: !opts.purchase && !!reg?.compositionScheme,
    reverseCharge: !!opts.reverseCharge,
  };
}

/** The state a document is supplied from: the branch's GSTIN state when it has one, else the company's. */
export function homeStateCode(company: Company | undefined, branch?: Branch): string | undefined {
  const fromGstin = branch?.gstin?.slice(0, 2);
  return fromGstin && /^\d{2}$/.test(fromGstin) ? fromGstin : company?.taxRegistration?.placeOfSupplyStateCode;
}

/**
 * Split a combined rate into its legal components (FRD 15 / FRD 16).
 *
 * India: an intra-state supply splits evenly into CGST + SGST, an inter-state
 * supply becomes a single IGST line. Everything else is a single VAT line.
 */
export function splitTax(
  taxableAmount: Money,
  rate: number,
  ctx: TaxContext,
): TaxComponent[] {
  if (rate <= 0 || !ctx.registered || ctx.zeroRated || ctx.composition) return [];

  const total = percent(taxableAmount, rate);

  if (ctx.regime === 'GST') {
    const interState =
      !!ctx.crossBorder ||
      (!!ctx.homeStateCode &&
      !!ctx.placeOfSupplyStateCode &&
      ctx.homeStateCode !== ctx.placeOfSupplyStateCode);

    if (interState) {
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

  if (ctx.regime === 'VAT') {
    return [{ type: 'VAT', label: `VAT ${rate}%`, rate, amount: total }];
  }

  return [];
}

/** Compensation cess on a taxable value, as its own component (never split between centre and state). */
export function cessComponent(taxableAmount: Money, rate: number | undefined, ctx: TaxContext): TaxComponent[] {
  if (!rate || rate <= 0 || !ctx.registered || ctx.zeroRated || ctx.composition) return [];
  return [{ type: 'CESS', label: `Cess ${rate}%`, rate, amount: percent(taxableAmount, rate) }];
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
    case 'VAT':
      return 'VAT';
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

export function rateOf(categories: TaxCategory[], id: string | undefined, date?: string): number {
  const c = findTaxCategory(categories, id);
  return c ? taxRateOn(c, date) : 0;
}

/**
 * A category's rate on `date`: its rate from `effectiveFrom` on, and before that the last of its
 * earlier rates (`history`) to have started by then. No date, or nothing earlier on record, is
 * today's rate. The server charges a document the same way.
 */
export function taxRateOn(category: Pick<TaxCategory, 'rate' | 'effectiveFrom' | 'history'>, date: string | undefined): number {
  if (!date || !category.effectiveFrom || category.effectiveFrom <= date) return category.rate;
  let best: { effectiveFrom: string; rate: number } | undefined;
  for (const h of category.history ?? []) if (h.effectiveFrom <= date && (!best || h.effectiveFrom > best.effectiveFrom)) best = h;
  return best?.rate ?? category.rate;
}

/**
 * Whether a category may be charged on `date`: it is in force from its first rate's day (its
 * effective date, or the earliest of its earlier rates). A tax that starts later can't be picked
 * on a document or expense dated before it.
 */
export function taxAvailableOn(category: Pick<TaxCategory, 'effectiveFrom' | 'history'>, date: string | undefined): boolean {
  if (!date || !category.effectiveFrom) return true;
  const start = (category.history ?? []).reduce((a, h) => (h.effectiveFrom < a ? h.effectiveFrom : a), category.effectiveFrom);
  return start <= date;
}

/** Every category at its rate on `date`, for a form that charges as of that day. */
export function taxCategoriesOn<T extends TaxCategory>(categories: T[], date: string | undefined): T[] {
  return categories.map((c) => {
    const rate = taxRateOn(c, date);
    return rate === c.rate ? c : { ...c, rate };
  });
}
