import { Money, allocate, money, percent, zero } from '@/lib/money';
import { Company, Party, TaxCategory, TaxComponent, TaxType } from '@/types';
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
  /** No GST on the document: an export / SEZ supply under LUT, or an import bill. */
  zeroRated?: boolean;
};

/** Is the company's Letter of Undertaking in force on `date`? */
export function lutActive(company: Company | undefined, date: string): boolean {
  const reg = company?.taxRegistration;
  if (!reg?.registered || reg.regime !== 'GST' || !reg.lutNumber) return false;
  return !reg.lutValidTill || date <= reg.lutValidTill;
}

/**
 * The tax context for one document: the company's registration, the place of
 * supply, and whether the party makes it an export, SEZ supply or import.
 */
export function buildTaxContext(
  company: Company | undefined,
  opts: { placeOfSupply?: string; party?: Party; date: string; purchase: boolean },
): TaxContext {
  const reg = company?.taxRegistration;
  const pos = opts.placeOfSupply ?? reg?.placeOfSupplyStateCode;
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
    homeStateCode: reg?.placeOfSupplyStateCode,
    placeOfSupplyStateCode: pos,
    registered: !!reg?.registered,
    crossBorder,
    // A foreign supplier's bill carries no Indian GST (IGST on imports is paid at customs).
    zeroRated:
      crossBorder === 'import' ||
      (!!crossBorder && !opts.purchase && lutActive(company, opts.date)),
  };
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
  if (rate <= 0 || !ctx.registered || ctx.zeroRated) return [];

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

export function rateOf(categories: TaxCategory[], id: string | undefined): number {
  return findTaxCategory(categories, id)?.rate ?? 0;
}
