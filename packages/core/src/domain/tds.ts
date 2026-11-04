import { TdsSection, tdsSection } from '../data/tdsSections';

/** A lower or nil deduction certificate (s.197), for one deductee. */
export type LowerTdsCertificate = { rate: number; validTill: string; limitMinor?: number };

export type TdsInput = {
  section: string | undefined;
  /** The deductee's PAN; its fourth letter says individual (P) or HUF (H). */
  pan?: string;
  certificate?: LowerTdsCertificate;
  date: string;
  /** This bill's amount TDS is worked on: its taxable value, without GST (CBDT circular 23/2017). Base currency paise. */
  baseMinor: number;
  /** Earlier bills of the year with this deductee under this section: their base and the TDS already deducted. */
  prior: { baseMinor: number; tdsMinor: number };
};

export type TdsResult = {
  rate: number;
  amountMinor: number;
  /** Why it came out as it did, for the bill to say. */
  reason: 'none' | 'belowThreshold' | 'deducted' | 'catchUp' | 'lowerCertificate' | 'noPan';
};

/** An individual's or HUF's PAN has P or H as its fourth letter. */
export function isIndividualPan(pan: string | undefined): boolean {
  const c = pan?.trim().toUpperCase()[3];
  return c === 'P' || c === 'H';
}

export function tdsRate(section: TdsSection, pan: string | undefined, certificate: LowerTdsCertificate | undefined, date: string): { rate: number; reason: TdsResult['reason'] } {
  if (!pan || !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.trim().toUpperCase())) {
    return { rate: Math.max(section.noPanRate, section.rateOther), reason: 'noPan' };
  }
  if (certificate && date <= certificate.validTill) return { rate: certificate.rate, reason: 'lowerCertificate' };
  return { rate: isIndividualPan(pan) ? section.rateIndividual : section.rateOther, reason: 'deducted' };
}

const pct = (minor: number, rate: number) => Math.round((minor * rate) / 100);

/**
 * The TDS to deduct on one bill. Nothing until a threshold is crossed: the single-bill one, or the
 * year's total with the deductee. The bill that takes the year past the annual threshold carries
 * the TDS the earlier bills didn't (a catch-up). Under 194Q only what the year's purchases exceed
 * ₹50 lakh by is taxed.
 */
export function tdsFor(input: TdsInput): TdsResult {
  const section = tdsSection(input.section);
  if (!section || input.baseMinor <= 0) return { rate: 0, amountMinor: 0, reason: 'none' };
  const { rate, reason } = tdsRate(section, input.pan, input.certificate, input.date);
  const total = input.prior.baseMinor + input.baseMinor;
  const annual = section.annualThresholdMinor;

  if (section.onExcessOnly && annual !== undefined) {
    const taxedNow = Math.min(input.baseMinor, Math.max(0, total - annual));
    if (taxedNow <= 0) return { rate, amountMinor: 0, reason: 'belowThreshold' };
    return { rate, amountMinor: pct(taxedNow, rate), reason };
  }

  const overSingle = section.singleThresholdMinor !== undefined && input.baseMinor > section.singleThresholdMinor;
  const overAnnual = annual !== undefined && total > annual;
  if (!overSingle && !overAnnual) return { rate, amountMinor: 0, reason: 'belowThreshold' };
  // The bill that first crosses the year's threshold catches up on the year so far.
  if (overAnnual && input.prior.baseMinor <= annual!) {
    const owed = pct(total, rate) - input.prior.tdsMinor;
    return { rate, amountMinor: Math.max(owed, 0), reason: owed > pct(input.baseMinor, rate) ? 'catchUp' : reason };
  }
  return { rate, amountMinor: pct(input.baseMinor, rate), reason };
}

/** The quarter TDS is reported in (Form 26Q): Q1 is April–June. */
export function tdsQuarter(date: string): { fy: string; quarter: 1 | 2 | 3 | 4 } {
  const [y, m] = date.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  const quarter = (m >= 4 ? Math.ceil((m - 3) / 3) : 4) as 1 | 2 | 3 | 4;
  return { fy: `${start}-${String((start + 1) % 100).padStart(2, '0')}`, quarter };
}

export type TdsRegisterRow = {
  section: string;
  sectionLabel: string;
  partyId: string;
  partyName: string;
  pan?: string;
  quarter: string;
  /** What TDS was worked on, and what was deducted: base currency paise. */
  baseMinor: number;
  tdsMinor: number;
  documents: number;
};

type Deductee = { id: string; name: string; pan?: string };
type Deduction = { partyId?: string; date: string; tds?: { section: string; amount: { minor: number } }; baseMinor: number; sign: number };

/**
 * TDS deducted in a period, one row per section, deductee and quarter: the input for Form 26Q.
 * Supplier credit notes give TDS back on the bill they lower.
 */
export function tdsRegister(entries: Deduction[], parties: Deductee[], range: { from: string; to: string }): TdsRegisterRow[] {
  const rows = new Map<string, TdsRegisterRow>();
  for (const e of entries) {
    if (!e.tds || !e.tds.amount.minor || !e.partyId || e.date < range.from || e.date > range.to) continue;
    const party = parties.find((p) => p.id === e.partyId);
    const q = tdsQuarter(e.date);
    const quarter = `FY ${q.fy} Q${q.quarter}`;
    const key = `${e.tds.section}|${e.partyId}|${quarter}`;
    const row = rows.get(key) ?? {
      section: e.tds.section,
      sectionLabel: tdsSection(e.tds.section)?.label ?? e.tds.section,
      partyId: e.partyId,
      partyName: party?.name ?? '—',
      pan: party?.pan,
      quarter,
      baseMinor: 0,
      tdsMinor: 0,
      documents: 0,
    };
    row.baseMinor += e.sign * e.baseMinor;
    row.tdsMinor += e.sign * e.tds.amount.minor;
    row.documents += 1;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => a.quarter.localeCompare(b.quarter) || a.section.localeCompare(b.section) || a.partyName.localeCompare(b.partyName));
}

const TDS_KINDS = ['purchaseBill', 'supplierDebitNote', 'supplierCreditNote'];

/**
 * The app's own copy of the server's year-so-far (apps/api/src/lib/tds.ts), from the documents on
 * the device: bills, supplier debit and credit notes with the same PAN in the same April–March year.
 */
export function tdsPriorOnDevice(
  documents: { id: string; kind: string; status: string; partyId: string; date: string; currency: string; exchangeRate: number; totals: { taxableAmount: { minor: number } }; tds?: { section: string; amount: { minor: number } } }[],
  parties: { id: string; pan?: string }[],
  party: { id: string; pan?: string },
  section: string,
  date: string,
  baseCurrency: string,
  exceptId?: string,
): { baseMinor: number; tdsMinor: number } {
  const [y, m] = date.split('-').map(Number);
  const start = `${m >= 4 ? y : y - 1}-04-01`;
  const end = `${m >= 4 ? y + 1 : y}-03-31`;
  const same = new Set(party.pan ? parties.filter((p) => p.pan === party.pan).map((p) => p.id) : [party.id]);
  same.add(party.id);
  let baseMinor = 0;
  let tdsMinor = 0;
  for (const d of documents) {
    if (d.id === exceptId || !TDS_KINDS.includes(d.kind) || !same.has(d.partyId) || d.date < start || d.date > end) continue;
    if (['draft', 'cancelled', 'rejected'].includes(d.status)) continue;
    if (d.tds && d.tds.section !== section) continue;
    const sign = d.kind === 'supplierCreditNote' ? -1 : 1;
    const rate = d.currency === baseCurrency ? 1 : d.exchangeRate;
    baseMinor += sign * Math.round(d.totals.taxableAmount.minor * rate);
    tdsMinor += sign * (d.tds?.amount.minor ?? 0);
  }
  return { baseMinor, tdsMinor };
}
