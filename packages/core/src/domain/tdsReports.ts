import { tdsSection } from '../data/tdsSections';
import type { BusinessDocument, Party, Payment, Voucher } from '../types';
import type { Posting } from './ledger/postings';
import { tdsQuarter } from './tds';

/**
 * TDS from the books: what was deducted and deposited (TDS payable), what customers deducted from
 * what they paid (TDS receivable, to check against Form 26AS), the deductee rows Form 26Q asks for,
 * and the challans. Amounts in base-currency paise. TDS payable accounts are `sys:tdsPayable:<section>`
 * for bills and for payments that name one; plain `sys:tdsPayable` only for an older payment without.
 */

const PAYABLE = 'sys:tdsPayable';
/** The section a TDS payable account is for; '' when the deduction named none. */
export const sectionOfAccount = (account: string) => (account.startsWith(`${PAYABLE}:`) ? account.slice(PAYABLE.length + 1) : '');
const isPayable = (account: string) => account === PAYABLE || account.startsWith(`${PAYABLE}:`);
const isChallan = (p: Posting) => p.source.type === 'voucher' && p.source.kind === 'tdsChallan';

/** TDS deducted in a month is deposited by the 7th of the next; March's by 30 April (Rule 30). */
export function tdsDepositDue(date: string): string {
  const [y, m] = date.split('-').map(Number);
  if (m === 3) return `${y}-04-30`;
  const next = new Date(Date.UTC(y, m, 7));
  return next.toISOString().slice(0, 10);
}

export type TdsPayableRow = {
  section: string;
  /** YYYY-MM the TDS was deducted in. */
  month: string;
  deductedMinor: number;
  depositedMinor: number;
  balanceMinor: number;
  dueDate: string;
  /** Still owing after its due date (as of `asOf`). */
  overdue: boolean;
};

/**
 * TDS payable by section and month: deducted, deposited, and what is left. A challan pays the oldest
 * month of its section first, so a deposit made in October settles September.
 */
export function tdsPayableSummary(postings: Posting[], range: { from: string; to: string }, asOf: string): TdsPayableRow[] {
  const rows = new Map<string, TdsPayableRow>();
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
    const row = rows.get(key) ?? { section, month, deductedMinor: 0, depositedMinor: 0, balanceMinor: 0, dueDate: tdsDepositDue(`${month}-01`), overdue: false };
    row.deductedMinor += p.credit - p.debit;
    rows.set(key, row);
  }
  const sorted = [...rows.values()].sort((a, b) => a.month.localeCompare(b.month));
  for (const d of deposits.sort((a, b) => a.date.localeCompare(b.date))) {
    let left = d.minor;
    for (const r of sorted.filter((x) => x.section === d.section)) {
      if (left <= 0) break;
      const take = Math.min(left, r.deductedMinor - r.depositedMinor);
      if (take <= 0) continue;
      r.depositedMinor += take;
      left -= take;
    }
  }
  return sorted
    .map((r) => {
      const balanceMinor = r.deductedMinor - r.depositedMinor;
      return { ...r, balanceMinor, overdue: balanceMinor > 0 && asOf > r.dueDate };
    })
    .filter((r) => (r.month >= range.from.slice(0, 7) && r.month <= range.to.slice(0, 7)) || r.balanceMinor > 0)
    .sort((a, b) => a.month.localeCompare(b.month) || a.section.localeCompare(b.section));
}

export type TdsReceivableRow = { partyId: string; partyName: string; pan?: string; quarter: string; tdsMinor: number; receipts: number };

/** TDS customers kept back from what they paid, by customer and quarter: to tick off against Form 26AS. */
export function tdsReceivable(postings: Posting[], parties: Pick<Party, 'id' | 'name' | 'pan'>[], range: { from: string; to: string }): TdsReceivableRow[] {
  const rows = new Map<string, TdsReceivableRow>();
  for (const p of postings) {
    if (p.account !== 'sys:tdsReceivable' || p.source.type !== 'payment' || !p.partyId || p.date < range.from || p.date > range.to) continue;
    const q = tdsQuarter(p.date);
    const quarter = `FY ${q.fy} Q${q.quarter}`;
    const key = `${p.partyId}|${quarter}`;
    const party = parties.find((x) => x.id === p.partyId);
    const row = rows.get(key) ?? { partyId: p.partyId, partyName: party?.name ?? '—', pan: party?.pan, quarter, tdsMinor: 0, receipts: 0 };
    row.tdsMinor += p.debit - p.credit;
    row.receipts += 1;
    rows.set(key, row);
  }
  return [...rows.values()].filter((r) => r.tdsMinor).sort((a, b) => a.quarter.localeCompare(b.quarter) || a.partyName.localeCompare(b.partyName));
}

export type TdsChallanRow = {
  voucherId: string;
  number: string;
  date: string;
  bsrCode?: string;
  serial?: string;
  depositedOn?: string;
  /** By section, what the challan deposited. */
  sections: { section: string; minor: number }[];
  totalMinor: number;
  /** How many deductions it settles (oldest first). */
  deductions: number;
};

export type TdsDeducteeRow = {
  documentId: string;
  number: string;
  date: string;
  quarter: string;
  section: string;
  sectionLabel: string;
  partyId: string;
  partyName: string;
  pan?: string;
  /** Amount paid or credited, and the TDS on it. Negative on a supplier credit note. */
  amountMinor: number;
  tdsMinor: number;
  rate: number;
  /** The challan that deposited it, once one has. */
  challan?: { voucherId: string; number: string; bsrCode?: string; serial?: string; depositedOn?: string };
};

/**
 * Form 26Q's deductee rows, one per bill and one per payment that kept TDS back under a section, each
 * with the challan that deposited it, and the challan register. Challans settle a section's deductions
 * oldest first. An older payment that named no section is in the payable summary but not here.
 */
export function tdsReturnRows(
  documents: BusinessDocument[],
  vouchers: Voucher[],
  parties: Pick<Party, 'id' | 'name' | 'pan'>[],
  baseCurrency: string,
  range: { from: string; to: string },
  payments: Payment[] = [],
): { deductees: TdsDeducteeRow[]; challans: TdsChallanRow[] } {
  const fromPayments: TdsDeducteeRow[] = payments
    .filter((p) => p.direction === 'paid' && p.tdsSection && p.tdsSection !== 'none')
    .flatMap((p) => {
      const rate = p.currency === baseCurrency ? 1 : p.exchangeRate || 1;
      const tds = p.allocations.reduce((a, x) => a + (x.tdsDeducted?.minor ?? 0), 0);
      if (!tds) return [];
      // What was paid or credited against the deduction: the cash on those documents plus the TDS.
      const paid = p.allocations.filter((x) => x.tdsDeducted?.minor).reduce((a, x) => a + x.amount.minor + (x.tdsDeducted?.minor ?? 0), 0);
      const party = parties.find((x) => x.id === p.partyId);
      const q = tdsQuarter(p.date);
      return [
        {
          documentId: p.id,
          number: p.number,
          date: p.date,
          quarter: `FY ${q.fy} Q${q.quarter}`,
          section: p.tdsSection!,
          sectionLabel: tdsSection(p.tdsSection)?.label ?? p.tdsSection!,
          partyId: p.partyId,
          partyName: party?.name ?? '—',
          pan: party?.pan,
          amountMinor: Math.round(paid * rate),
          tdsMinor: Math.round(tds * rate),
          rate: paid ? Math.round((tds / paid) * 10_000) / 100 : 0,
        },
      ];
    });
  const all: TdsDeducteeRow[] = documents
    .filter((d) => ['purchaseBill', 'supplierDebitNote', 'supplierCreditNote'].includes(d.kind) && !['draft', 'cancelled', 'rejected', 'requested'].includes(d.status) && d.tds?.amount.minor)
    .map((d): TdsDeducteeRow => {
      const rate = d.currency === baseCurrency ? 1 : d.exchangeRate || 1;
      const sign = d.kind === 'supplierCreditNote' ? -1 : 1;
      const party = parties.find((p) => p.id === d.partyId);
      const q = tdsQuarter(d.date);
      return {
        documentId: d.id,
        number: d.supplierDocNumber ?? d.number,
        date: d.date,
        quarter: `FY ${q.fy} Q${q.quarter}`,
        section: d.tds!.section,
        sectionLabel: tdsSection(d.tds!.section)?.label ?? d.tds!.section,
        partyId: d.partyId,
        partyName: party?.name ?? '—',
        pan: party?.pan,
        amountMinor: sign * Math.round(d.totals.taxableAmount.minor * rate),
        tdsMinor: sign * Math.round(d.tds!.amount.minor * rate),
        rate: d.tds!.rate,
      };
    })
    .concat(fromPayments)
    .sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));

  const challans: TdsChallanRow[] = vouchers
    .filter((v) => v.kind === 'tdsChallan')
    .map((v) => {
      const sections = v.lines.filter((l) => isPayable(l.account) && l.debit.minor).map((l) => ({ section: sectionOfAccount(l.account), minor: l.debit.minor }));
      return {
        voucherId: v.id,
        number: v.number,
        date: v.date,
        bsrCode: v.challan?.bsrCode,
        serial: v.challan?.serial,
        depositedOn: v.challan?.depositedOn ?? v.date,
        sections,
        totalMinor: sections.reduce((a, s) => a + s.minor, 0),
        deductions: 0,
      };
    })
    .sort((a, b) => (a.depositedOn ?? a.date).localeCompare(b.depositedOn ?? b.date));

  // Oldest deduction of a section first: each challan pays what is still owed, in order.
  const owed = new Map(all.map((d) => [d.documentId, d.tdsMinor]));
  for (const c of challans) {
    for (const s of c.sections) {
      let left = s.minor;
      for (const d of all) {
        if (left <= 0) break;
        if (d.section !== s.section || d.tdsMinor <= 0 || (owed.get(d.documentId) ?? 0) <= 0 || d.date > (c.depositedOn ?? c.date)) continue;
        const take = Math.min(left, owed.get(d.documentId)!);
        owed.set(d.documentId, owed.get(d.documentId)! - take);
        left -= take;
        if (!owed.get(d.documentId)) {
          d.challan = { voucherId: c.voucherId, number: c.number, bsrCode: c.bsrCode, serial: c.serial, depositedOn: c.depositedOn };
          c.deductions += 1;
        }
      }
    }
  }
  const inRange = (date: string) => date >= range.from && date <= range.to;
  return { deductees: all.filter((d) => inRange(d.date)), challans: challans.filter((c) => inRange(c.depositedOn ?? c.date)) };
}
