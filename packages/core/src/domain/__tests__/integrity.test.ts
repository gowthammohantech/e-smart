import { integrityChecks, type IntegrityInput } from '../ledger/integrity';
import type { Posting } from '../ledger/postings';

const post = (source: string, account: string, debit: number, credit: number, date = '2026-06-01'): Posting => {
  const [type, id] = source.split(':') as [Posting['source']['type'], string];
  return { date, account, debit, credit, source: { type, id, number: id.toUpperCase() } };
};

// An invoice for 1,180 to a customer, half of it paid.
const books: Posting[] = [
  post('document:inv1', 'party:c1', 118_000, 0),
  post('document:inv1', 'sys:sales', 0, 100_000),
  post('document:inv1', 'sys:outputCgst', 0, 9_000),
  post('document:inv1', 'sys:outputSgst', 0, 9_000),
  post('payment:p1', 'pay:cash', 59_000, 0, '2026-06-10'),
  post('payment:p1', 'party:c1', 0, 59_000, '2026-06-10'),
];
const clean: IntegrityInput = {
  postings: books,
  asOf: '2027-03-31',
  stock: { items: [], movements: [], baseCurrency: 'INR' },
  partyStatements: [{ id: 'c1', name: 'Sunrise Retail', balance: 59_000 }],
  allocations: [{ documentId: 'inv1', number: 'INV1', total: 118_000, allocated: 59_000 }],
};
const byKey = (input: IntegrityInput) => Object.fromEntries(integrityChecks(input).map((c) => [c.key, c]));

describe('ledger integrity', () => {
  it('passes every check on books that agree with their records', () => {
    expect(integrityChecks(clean).every((c) => c.ok)).toBe(true);
    expect(byKey(clean).stock.expected).toBeUndefined();
  });

  it('finds a source whose postings do not balance, and round-off of a rupee or more', () => {
    const r = byKey({ ...clean, postings: [...books, post('document:inv2', 'party:c1', 1_000, 0), post('document:inv3', 'sys:roundOff', 150, 0), post('document:inv3', 'sys:sales', 0, 150)] });
    expect(r.sourcesBalance.ok).toBe(false);
    expect(r.sourcesBalance.items).toEqual([{ ref: 'document:inv2', label: 'INV2', expected: 1_000, actual: 0 }]);
    expect(r.trialBalance).toMatchObject({ ok: false, expected: 178_150, actual: 177_150 });
    expect(r.roundOff.items.map((i) => i.label)).toEqual(['INV3']);
  });

  it('finds a party whose statement and ledger disagree', () => {
    const r = byKey({ ...clean, partyStatements: [{ id: 'c1', name: 'Sunrise Retail', balance: 60_000 }] });
    expect(r.partyLedgers.items).toEqual([{ ref: 'party:c1', label: 'Sunrise Retail', expected: 60_000, actual: 59_000 }]);
  });

  it('finds a document with more set against it than it is for', () => {
    const r = byKey({ ...clean, allocations: [{ documentId: 'inv1', number: 'INV1', total: 118_000, allocated: 120_000 }] });
    expect(r.allocations.items[0]).toMatchObject({ label: 'INV1', expected: 118_000, actual: 120_000 });
  });

  it('compares perpetual stock posted with what the stock ledger values it at', () => {
    const item = { id: 'i1', purchasePrice: { minor: 6_000, currency: 'INR' }, trackInventory: true, currency: 'INR' } as never;
    const movements = [{ id: 'm1', itemId: 'i1', quantity: 10, unitCost: { minor: 6_000, currency: 'INR' }, type: 'purchaseReceipt', date: '2026-05-01' }] as never;
    const stock = { items: [item], movements, baseCurrency: 'INR', perpetualFrom: '2026-04-01' };
    const posted = [post('stock:m1', 'sys:openingStock', 60_000, 0, '2026-05-01'), post('stock:m1', 'sys:purchases', 0, 60_000, '2026-05-01')];
    const ok = byKey({ ...clean, postings: [...books, ...posted], stock });
    expect(ok.stock).toMatchObject({ ok: true, expected: 60_000, actual: 60_000 });
    const drifted = byKey({ ...clean, postings: [...books, posted[0], { ...posted[1] }, post('stock:m2', 'sys:openingStock', 500, 0), post('stock:m2', 'sys:purchases', 0, 500)], stock });
    expect(drifted.stock).toMatchObject({ ok: false, expected: 60_000, actual: 60_500 });
  });
});
