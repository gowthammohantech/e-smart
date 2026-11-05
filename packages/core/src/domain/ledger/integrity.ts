import type { Posting } from './postings';
import { costedStockValue, perpetualStock } from '../stockLedger';
import type { Stock } from './reports';

/**
 * Does the ledger agree with the records it is worked out from? Postings are computed, never stored
 * (RULES 6.1), so these are the places the two could part: a source whose postings don't balance, a
 * party whose own statement says something its ledger account doesn't, perpetual stock whose account
 * has drifted from the stock ledger's valuation, or a document with more money set against it than
 * it is for. Each check lists the records that disagree, so the report can open them.
 */

export type IntegrityItem = { ref: string; label: string; expected: number; actual: number };
export type IntegrityCheck = {
  key: 'sourcesBalance' | 'roundOff' | 'trialBalance' | 'partyLedgers' | 'stock' | 'allocations';
  ok: boolean;
  /** What the records say and what the ledger says, where the check compares totals. */
  expected?: number;
  actual?: number;
  /** The records that disagree, at most 50. */
  items: IntegrityItem[];
};

export type IntegrityInput = {
  postings: Posting[];
  asOf: string;
  stock: Stock;
  /** Each party's balance from its own statement, debit positive (they owe us), in base currency. */
  partyStatements: { id: string; name: string; balance: number }[];
  /** What each document is for and how much is set against it. */
  allocations: { documentId: string; number: string; total: number; allocated: number }[];
};

/** Round-off a single document may carry: under a rupee. */
const ROUND_OFF_LIMIT = 100;
const MAX_ITEMS = 50;

const check = (key: IntegrityCheck['key'], items: IntegrityItem[], totals?: { expected: number; actual: number }): IntegrityCheck => ({
  key,
  ok: !items.length && (!totals || totals.expected === totals.actual),
  ...totals,
  items: items.slice(0, MAX_ITEMS),
});

export function integrityChecks(input: IntegrityInput): IntegrityCheck[] {
  const upTo = input.postings.filter((p) => p.date <= input.asOf);

  // 1. Every source's postings balance: debits equal credits for each document, payment, voucher…
  const bySource = new Map<string, { label: string; debit: number; credit: number; roundOff: number }>();
  for (const p of upTo) {
    const k = `${p.source.type}:${p.source.id}:${p.date}`;
    const s = bySource.get(k) ?? { label: p.source.number, debit: 0, credit: 0, roundOff: 0 };
    s.debit += p.debit;
    s.credit += p.credit;
    if (p.account === 'sys:roundOff') s.roundOff += p.debit - p.credit;
    bySource.set(k, s);
  }
  const unbalanced: IntegrityItem[] = [];
  const roundOff: IntegrityItem[] = [];
  for (const [k, s] of bySource) {
    const ref = k.split(':').slice(0, 2).join(':');
    if (s.debit !== s.credit) unbalanced.push({ ref, label: s.label, expected: s.debit, actual: s.credit });
    // Opening balances settle their difference elsewhere (Opening balances, in capital), not through round-off.
    if (Math.abs(s.roundOff) >= ROUND_OFF_LIMIT && !k.startsWith('opening:')) roundOff.push({ ref, label: s.label, expected: 0, actual: s.roundOff });
  }

  // 2. The trial balance: all debits against all credits.
  const totalDebit = upTo.reduce((a, p) => a + p.debit, 0);
  const totalCredit = upTo.reduce((a, p) => a + p.credit, 0);

  // 3. Each party: its statement against its ledger account.
  const ledger = new Map<string, number>();
  for (const p of upTo) if (p.account.startsWith('party:')) ledger.set(p.account, (ledger.get(p.account) ?? 0) + p.debit - p.credit);
  const parties: IntegrityItem[] = input.partyStatements
    .map((s) => ({ ref: `party:${s.id}`, label: s.name, expected: s.balance, actual: ledger.get(`party:${s.id}`) ?? 0 }))
    .filter((i) => i.expected !== i.actual);

  // 4. Perpetual stock: the posted balance of Stock in hand against the stock ledger's value that day,
  // costed as perpetual stock costs it (what was there before it began, then the moving average).
  // Periodic stock is valued on the day and never posted, so there is nothing to drift.
  const { items, movements, baseCurrency, perpetualFrom, sourceOf } = input.stock;
  const perpetual = !!perpetualFrom && input.asOf >= perpetualFrom;
  const costing = perpetual ? perpetualStock(items, movements, perpetualFrom, baseCurrency, sourceOf) : undefined;
  const stockValue = costing ? Math.round(costing.broughtForward + costedStockValue(costing.costed, input.asOf)) : 0;
  const stockPosted = perpetual ? Math.round(upTo.filter((p) => p.account === 'sys:openingStock').reduce((a, p) => a + p.debit - p.credit, 0)) : 0;

  // 5. No document has more set against it than it is for.
  const over: IntegrityItem[] = input.allocations
    .filter((a) => a.allocated > a.total)
    .map((a) => ({ ref: `document:${a.documentId}`, label: a.number, expected: a.total, actual: a.allocated }));

  return [
    check('sourcesBalance', unbalanced),
    check('roundOff', roundOff),
    check('trialBalance', [], { expected: totalDebit, actual: totalCredit }),
    check('partyLedgers', parties),
    check('stock', [], perpetual ? { expected: stockValue, actual: stockPosted } : undefined),
    check('allocations', over),
  ];
}
