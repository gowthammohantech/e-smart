import { BookBill, TwoBLine, normalizeNumber, reconcile2b } from '../reconcile2b';

const S = '29AACFA9876P1ZH';
const line = (over: Partial<TwoBLine> = {}): TwoBLine => ({ id: Math.random().toString(36).slice(2), supplierGstin: S, documentType: 'I', number: 'AS/101', date: '2026-09-05', taxableMinor: 1_000_000, taxMinor: 180_000, itcAvailable: true, ...over });
const bill = (over: Partial<BookBill> = {}): BookBill => ({ id: Math.random().toString(36).slice(2), kind: 'purchaseBill', supplierGstin: S, number: 'AS/101', date: '2026-09-05', taxableMinor: 1_000_000, taxMinor: 180_000, ...over });

describe('GSTR-2B reconciliation', () => {
  it('reads a supplier’s number the same whatever its case, separators, zeros or year', () => {
    expect(normalizeNumber('INV/24-25/0012')).toBe(normalizeNumber('inv-12'));
    expect(normalizeNumber('INV 0012')).toBe('INV12');
    expect(normalizeNumber('AS/2026-27/7')).toBe('AS7');
  });

  it('matches a bill with the same supplier, number, date and amounts, within a rupee', () => {
    const r = reconcile2b([line({ taxMinor: 180_050 })], [bill()]);
    expect(r.matches[0].status).toBe('matched');
    expect(r.claimableTaxMinor).toBe(180_050);
    expect(r.missingIn2b).toEqual([]);
  });

  it('calls it partial when the amount or date differs, and says by how much', () => {
    const r = reconcile2b([line({ taxableMinor: 1_100_000, taxMinor: 198_000, date: '2026-09-06' })], [bill()]);
    expect(r.matches[0]).toMatchObject({ status: 'partial', difference: { taxableMinor: 100_000, taxMinor: 18_000, days: 1 } });
    expect(r.claimableTaxMinor).toBe(0);
  });

  it('suggests a probable match for the same tax a day or two apart under another number', () => {
    const r = reconcile2b([line({ number: 'AS/0102', date: '2026-09-07' })], [bill({ number: 'AS-1O2' })]);
    expect(r.matches[0].status).toBe('probable');
  });

  it('lists 2B lines not in the books and bills not in 2B', () => {
    const r = reconcile2b([line({ number: 'X1' })], [bill({ number: 'Y9', taxMinor: 5000 })]);
    expect(r.matches[0].status).toBe('missingInBooks');
    expect(r.missingIn2b.map((b) => b.number)).toEqual(['Y9']);
  });

  it('keeps a person’s decisions: linked, not ours, claim later; credit notes reduce the claim', () => {
    const b = bill({ number: 'OTHER' });
    const cn = bill({ kind: 'supplierCreditNote', number: 'CN-7', taxMinor: 18_000 });
    const r = reconcile2b(
      [line({ linkedDocumentId: b.id, decision: 'accepted' }), line({ number: 'Z', decision: 'notOurs' }), line({ number: 'L', decision: 'claimLater' }), line({ documentType: 'C', number: 'CN 7', taxMinor: 18_000, taxableMinor: 100_000 })],
      [b, { ...cn, taxableMinor: 100_000 }],
    );
    expect(r.matches.map((m) => m.status)).toEqual(['matched', 'notOurs', 'claimLater', 'matched']);
    expect(r.claimableTaxMinor).toBe(180_000 - 18_000);
  });

  it('never claims what 2B marks unavailable, and leaves bills already claimed out of the chase list', () => {
    const r = reconcile2b([line({ itcAvailable: false })], [bill(), bill({ number: 'OLD', claimedIn: '082026' })]);
    expect(r.matches[0].status).toBe('matched');
    expect(r.claimableTaxMinor).toBe(0);
    expect(r.missingIn2b).toEqual([]);
  });
});
