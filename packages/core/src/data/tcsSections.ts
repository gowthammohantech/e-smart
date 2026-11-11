/**
 * TCS a seller collects from its buyer (Income-tax Act s.206C), as it stands for FY 2025-26: on sales
 * of specified goods under s.206C(1), and of motor vehicles and notified luxury goods over ₹10 lakh
 * under s.206C(1F). s.206C(1H), on sales of other goods over ₹50 lakh, was omitted from 1 April 2025
 * and is not here. Statutory, so it ships with releases; a chartered accountant signs it off
 * (docs/accounting/RULES.md, 6.13).
 */
export type TcsSectionCode = 'scrap' | 'liquor' | 'tenduLeaves' | 'timberLease' | 'timberOther' | 'forestProduce' | 'minerals' | 'motorVehicle' | 'luxuryGoods';

export type TcsSection = {
  code: TcsSectionCode;
  /** The section as written, with its clause. */
  label: string;
  /** What is sold. */
  nature: string;
  /** Percent of the sale value. */
  rate: number;
  /** Collected only on a sale over this value (paise), for 206C(1F). */
  singleThresholdMinor?: number;
  /** Rate when the buyer has no PAN (s.206CC): twice the rate or 5%, whichever is higher. */
  noPanRate: number;
};

const s = (code: TcsSectionCode, label: string, nature: string, rate: number, extra: Partial<TcsSection> = {}): TcsSection => ({
  code,
  label,
  nature,
  rate,
  noPanRate: Math.max(rate * 2, 5),
  ...extra,
});

export const TCS_SECTIONS: TcsSection[] = [
  s('scrap', '206C(1) scrap', 'Scrap', 1),
  s('liquor', '206C(1) liquor', 'Alcoholic liquor for human consumption', 1),
  s('tenduLeaves', '206C(1) tendu leaves', 'Tendu leaves', 5),
  s('timberLease', '206C(1) timber (forest lease)', 'Timber obtained under a forest lease', 2.5),
  s('timberOther', '206C(1) timber', 'Timber obtained otherwise than under a forest lease', 2.5),
  s('forestProduce', '206C(1) forest produce', 'Other forest produce (not timber or tendu leaves)', 2.5),
  s('minerals', '206C(1) minerals', 'Coal, lignite or iron ore', 1),
  s('motorVehicle', '206C(1F) motor vehicle', 'Motor vehicle sold for over ₹10 lakh', 1, { singleThresholdMinor: 10_00_000_00 }),
  s('luxuryGoods', '206C(1F) luxury goods', 'Notified luxury goods sold for over ₹10 lakh', 1, { singleThresholdMinor: 10_00_000_00 }),
];

/**
 * The first invoice date TCS is no longer asked for. A product decision taken for the 1 April 2025
 * change: invoices dated before it keep the section and collect as before; from it on, an invoice
 * neither offers a section nor collects, whatever the customer has on file.
 */
export const TCS_ENDS_ON = '2025-04-01';

/** Whether an invoice of this date (YYYY-MM-DD) asks for TCS. */
export function tcsAskedOn(date: string | undefined | null): boolean {
  return !!date && date < TCS_ENDS_ON;
}

export function tcsSection(code: string | undefined | null): TcsSection | undefined {
  return TCS_SECTIONS.find((x) => x.code === code);
}

/**
 * The TCS rate a sale takes under a section: the higher no-PAN rate when the buyer has none (s.206CC),
 * and nothing on a 206C(1F) sale that isn't over its threshold. 0 when no TCS applies.
 */
export function tcsRateFor(code: string | undefined | null, buyerHasPan: boolean, saleValueBaseMinor: number): number {
  const sec = tcsSection(code);
  if (!sec) return 0;
  if (sec.singleThresholdMinor !== undefined && saleValueBaseMinor <= sec.singleThresholdMinor) return 0;
  return buyerHasPan ? sec.rate : sec.noPanRate;
}

/** The section a new invoice to this customer takes: theirs while TCS applies to them and it is known. */
export function partyTcsSection(p: { tcsApplicable?: boolean | null; tcsSection?: string | null } | undefined): TcsSectionCode | undefined {
  if (!p?.tcsApplicable) return undefined;
  return tcsSection(p.tcsSection)?.code;
}
