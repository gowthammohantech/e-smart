import { tcsSection } from '../data/tcsSections';
import type { BusinessDocument, Party } from '../types';
import type { Posting } from './ledger/postings';
import { tdsQuarter } from './tds';

/**
 * TCS from the books (RULES 6.13): what was collected on each invoice and given back on its credit
 * notes (the TCS register), and what is owed and deposited by section and month, with the quarter's
 * collectee totals Form 27EQ asks for (TCS payable). Amounts in base-currency paise. TCS payable
 * accounts are `sys:tcsPayable:<section>`; plain `sys:tcsPayable` only for an invoice that named none.
 */

const PAYABLE = 'sys:tcsPayable';
const isPayable = (account: string) => account === PAYABLE || account.startsWith(`${PAYABLE}:`);
const sectionOfAccount = (account: string) => (account.startsWith(`${PAYABLE}:`) ? account.slice(PAYABLE.length + 1) : '');
/** The same challan (ITNS 281) deposits TDS and TCS: a TDS challan voucher that clears TCS payable. */
const isChallan = (p: Posting) => p.source.type === 'voucher' && p.source.kind === 'tdsChallan';
const OFF_BOOKS = ['draft', 'requested', 'cancelled', 'rejected'];
const KINDS = ['invoice', 'creditNote', 'salesReturn'];

/** TCS collected in a month is deposited within seven days of its end, March too (Rule 37CA). */
export function tcsDepositDue(date: string): string {
  const [y, m] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m, 7)).toISOString().slice(0, 10);
}

export type TcsRegisterRow = {
  documentId: string;
  number: string;
  kind: string;
  date: string;
  quarter: string;
  partyId: string;
  partyName: string;
  pan?: string;
  section: string;
  sectionLabel: string;
  /** What TCS was worked on (the price with GST), the rate and the TCS. Negative on a credit note or return. */
  baseMinor: number;
  rate: number;
  tcsMinor: number;
};

type TcsDoc = Pick<BusinessDocument, 'id' | 'number' | 'kind' | 'status' | 'date' | 'partyId' | 'currency' | 'exchangeRate' | 'totals' | 'tcs'>;

/**
 * Every invoice that collected TCS in the period, and every credit note or return that gave it back
 * in proportion (a negative row), with the customer, PAN, section, base, rate and TCS.
 */
export function tcsRegister(documents: TcsDoc[], parties: Pick<Party, 'id' | 'name' | 'pan'>[], baseCurrency: string, range: { from: string; to: string }): TcsRegisterRow[] {
  return documents
    .filter((d) => KINDS.includes(d.kind) && !OFF_BOOKS.includes(d.status) && d.tcs && d.totals.tcs?.minor && d.date >= range.from && d.date <= range.to)
    .map((d) => {
      const rate = d.currency === baseCurrency ? 1 : d.exchangeRate || 1;
      const sign = d.kind === 'invoice' ? 1 : -1;
      const t = d.totals;
      const tcs = t.tcs!.minor;
      // TCS is worked on the price with GST, after the discount and with charges: the total before it and the round-off.
      const base = t.grandTotal.minor - t.roundOff.minor - (t.reimbursements?.minor ?? 0) - tcs;
      const party = parties.find((p) => p.id === d.partyId);
      const q = tdsQuarter(d.date);
      return {
        documentId: d.id,
        number: d.number,
        kind: d.kind,
        date: d.date,
        quarter: `FY ${q.fy} Q${q.quarter}`,
        partyId: d.partyId,
        partyName: party?.name ?? '—',
        pan: party?.pan,
        section: d.tcs!.section,
        sectionLabel: tcsSection(d.tcs!.section)?.label ?? d.tcs!.section,
        baseMinor: sign * Math.round(base * rate),
        rate: d.tcs!.rate,
        tcsMinor: sign * Math.round(tcs * rate),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
}

export type TcsPayableRow = {
  section: string;
  /** YYYY-MM the TCS was collected in. */
  month: string;
  collectedMinor: number;
  depositedMinor: number;
  balanceMinor: number;
  dueDate: string;
  overdue: boolean;
};

/** Form 27EQ's quarter totals: by section, what was collected from how many collectees on what base. */
export type Tcs27eqRow = { section: string; sectionLabel: string; quarter: string; collectees: number; documents: number; baseMinor: number; tcsMinor: number };

/**
 * TCS payable by section and month: collected (net of what credit notes gave back), deposited, left.
 * A challan pays the oldest month of its section first. With the quarter rows of the register.
 */
export function tcsPayableSummary(postings: Posting[], register: TcsRegisterRow[], range: { from: string; to: string }, asOf: string): { months: TcsPayableRow[]; quarters: Tcs27eqRow[] } {
  const rows = new Map<string, TcsPayableRow>();
  const deposits: { section: string; date: string; minor: number }[] = [];
  for (const p of postings) {
    if (!isPayable(p.account) || p.date > range.to) continue;
    const section = sectionOfAccount(p.account);
    if (isChallan(p)) {
      deposits.push({ section, date: p.date, minor: p.debit - p.credit });
      continue;
    }
    const month = p.date.slice(0, 7);
    const key = `${section}|${month}`;
    const row = rows.get(key) ?? { section, month, collectedMinor: 0, depositedMinor: 0, balanceMinor: 0, dueDate: tcsDepositDue(`${month}-01`), overdue: false };
    row.collectedMinor += p.credit - p.debit;
    rows.set(key, row);
  }
  const sorted = [...rows.values()].sort((a, b) => a.month.localeCompare(b.month));
  for (const d of deposits.sort((a, b) => a.date.localeCompare(b.date))) {
    let left = d.minor;
    for (const r of sorted.filter((x) => x.section === d.section)) {
      if (left <= 0) break;
      const take = Math.min(left, r.collectedMinor - r.depositedMinor);
      if (take <= 0) continue;
      r.depositedMinor += take;
      left -= take;
    }
  }
  const months = sorted
    .map((r) => {
      const balanceMinor = r.collectedMinor - r.depositedMinor;
      return { ...r, balanceMinor, overdue: balanceMinor > 0 && asOf > r.dueDate };
    })
    .filter((r) => (r.month >= range.from.slice(0, 7) && r.month <= range.to.slice(0, 7)) || r.balanceMinor > 0)
    .sort((a, b) => a.month.localeCompare(b.month) || a.section.localeCompare(b.section));

  const byQuarter = new Map<string, Tcs27eqRow & { parties: Set<string> }>();
  for (const r of register) {
    const key = `${r.section}|${r.quarter}`;
    const q = byQuarter.get(key) ?? { section: r.section, sectionLabel: r.sectionLabel, quarter: r.quarter, collectees: 0, documents: 0, baseMinor: 0, tcsMinor: 0, parties: new Set<string>() };
    q.parties.add(r.partyId);
    q.documents += 1;
    q.baseMinor += r.baseMinor;
    q.tcsMinor += r.tcsMinor;
    byQuarter.set(key, q);
  }
  const quarters = [...byQuarter.values()]
    .map(({ parties, ...q }) => ({ ...q, collectees: parties.size }))
    .sort((a, b) => a.quarter.localeCompare(b.quarter) || a.section.localeCompare(b.section));
  return { months, quarters };
}
