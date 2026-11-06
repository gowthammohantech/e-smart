/**
 * TDS sections a business deducts on what it pays suppliers, as the Income-tax Act sets them for
 * FY 2025-26 (after the Finance Act 2025 thresholds). Statutory, so they live here rather than as
 * company data; a change of rate ships as a release. A chartered accountant signs these off (see
 * docs/accounting/RULES.md).
 *
 * Thresholds are in paise. `single` is one payment or bill; `annual` is the total with the same
 * deductee in the financial year. Crossing the annual one makes the earlier bills of the year
 * taxable too.
 */
export type TdsSectionCode = '194C' | '194JA' | '194JB' | '194H' | '194IA' | '194IB' | '194A' | '194Q';

export type TdsSection = {
  code: TdsSectionCode;
  /** As the section is usually written: 194J(a), 194I(b). */
  label: string;
  /** What it covers, in a few words. */
  nature: string;
  /** Percent, for an individual or HUF deductee. */
  rateIndividual: number;
  /** Percent, for anyone else (firms, companies). */
  rateOther: number;
  singleThresholdMinor?: number;
  annualThresholdMinor?: number;
  /** 194Q: tax only on what the year's purchases exceed the annual threshold by. */
  onExcessOnly?: boolean;
  /** Rate without a PAN (s.206AA): 20% generally, 5% under 194Q. */
  noPanRate: number;
};

const L = 100 * 1_00_000; // ₹1 lakh in paise

export const TDS_SECTIONS: TdsSection[] = [
  { code: '194C', label: '194C', nature: 'Contractors and sub-contractors', rateIndividual: 1, rateOther: 2, singleThresholdMinor: 30_000_00, annualThresholdMinor: 1 * L, noPanRate: 20 },
  { code: '194JA', label: '194J(a)', nature: 'Technical services, royalty, call centres', rateIndividual: 2, rateOther: 2, annualThresholdMinor: 50_000_00, noPanRate: 20 },
  { code: '194JB', label: '194J(b)', nature: 'Professional services', rateIndividual: 10, rateOther: 10, annualThresholdMinor: 50_000_00, noPanRate: 20 },
  { code: '194H', label: '194H', nature: 'Commission and brokerage', rateIndividual: 2, rateOther: 2, annualThresholdMinor: 20_000_00, noPanRate: 20 },
  // Rent's threshold is ₹50,000 a month; a bill is usually a month's rent.
  { code: '194IA', label: '194I(a)', nature: 'Rent of plant and machinery', rateIndividual: 2, rateOther: 2, singleThresholdMinor: 50_000_00, noPanRate: 20 },
  { code: '194IB', label: '194I(b)', nature: 'Rent of land, building or furniture', rateIndividual: 10, rateOther: 10, singleThresholdMinor: 50_000_00, noPanRate: 20 },
  { code: '194A', label: '194A', nature: 'Interest other than on securities', rateIndividual: 10, rateOther: 10, annualThresholdMinor: 10_000_00, noPanRate: 20 },
  // Only for a buyer whose turnover was over ₹10 crore last year.
  { code: '194Q', label: '194Q', nature: 'Purchase of goods', rateIndividual: 0.1, rateOther: 0.1, annualThresholdMinor: 50 * L, onExcessOnly: true, noPanRate: 5 },
];

export function tdsSection(code: string | undefined): TdsSection | undefined {
  return code ? TDS_SECTIONS.find((s) => s.code === code) : undefined;
}
