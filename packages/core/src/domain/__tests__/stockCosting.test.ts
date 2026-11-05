import { costMovements, costedStockValue } from '../stockLedger';
import type { StockMovement, StockMovementType } from '../../types';

let n = 0;
const mv = (type: StockMovementType, quantity: number, unitCost: number, date: string, referenceId?: string, itemId = 'itm_a'): StockMovement => ({
  id: `stk_${++n}`,
  companyId: 'cmp',
  branchId: 'brn',
  itemId,
  type,
  quantity,
  unitCost: { minor: unitCost, currency: 'INR' },
  date,
  referenceId,
  createdBy: 'usr',
  createdAt: `2026-01-01T00:00:${String(n).padStart(2, '0')}Z`,
});
const items = [{ id: 'itm_a', purchasePrice: { minor: 900, currency: 'INR' } }];
const costs = (ms: StockMovement[], sourceOf?: (id: string) => string | undefined) => costMovements(items, ms, { sourceOf }).map((m) => Math.round(m.cost));

describe('costMovements', () => {
  it('issues at the moving average on the day', () => {
    // 10 at ₹10, sell 5 (at ₹10), buy 5 at ₹16 (avg ₹13), sell 4 at ₹13.
    const ms = [mv('purchaseReceipt', 10, 1000, '2026-04-01', 'bill1'), mv('salesIssue', 5, 0, '2026-04-02', 'inv1'), mv('purchaseReceipt', 5, 1600, '2026-04-03', 'bill2'), mv('salesIssue', 4, 0, '2026-04-04', 'inv2')];
    expect(costs(ms)).toEqual([10000, -5000, 8000, -5200]);
    expect(Math.round(costedStockValue(costMovements(items, ms)))).toBe(7800);
    expect(Math.round(costedStockValue(costMovements(items, ms), '2026-04-02'))).toBe(5000);
  });

  it('takes movements in date order, not the order given', () => {
    const ms = [mv('salesIssue', 2, 0, '2026-04-05', 'inv1'), mv('purchaseReceipt', 2, 1000, '2026-04-01', 'bill1'), mv('purchaseReceipt', 2, 2000, '2026-04-03', 'bill2')];
    expect(costs(ms)).toEqual([-3000, 2000, 4000]);
  });

  it('brings a sales return back at its invoice cost, and sends a purchase return back at its bill cost', () => {
    const sourceOf = (id: string) => ({ ret1: 'inv1', pr1: 'bill2' })[id];
    const ms = [
      mv('purchaseReceipt', 10, 1000, '2026-04-01', 'bill1'),
      mv('salesIssue', 2, 0, '2026-04-02', 'inv1'), // at ₹10
      mv('purchaseReceipt', 10, 2000, '2026-04-03', 'bill2'), // avg (80+200)/18
      mv('salesReturn', 1, 900, '2026-04-04', 'ret1'), // back at ₹10, not the average
      mv('purchaseReturn', 2, 0, '2026-04-05', 'pr1'), // out at ₹20
    ];
    expect(costs(ms, sourceOf)).toEqual([10000, -2000, 20000, 1000, -4000]);
  });

  it('values a cancelled document, and its reversal, at nothing', () => {
    const ms = [mv('purchaseReceipt', 4, 1000, '2026-04-01', 'bill1'), mv('salesIssue', 3, 0, '2026-04-02', 'inv1'), mv('adjustment', 3, 0, '2026-04-02', 'inv1')];
    expect(costs(ms)).toEqual([4000, 0, 0]);
  });

  it('leaves nothing behind when stock runs out, and falls back to the purchase price', () => {
    const ms = [mv('purchaseReceipt', 3, 1000, '2026-04-01', 'b1'), mv('purchaseReceipt', 3, 1001, '2026-04-01', 'b2'), mv('salesIssue', 6, 0, '2026-04-02', 'i1'), mv('salesIssue', 1, 0, '2026-04-03', 'i2')];
    const c = costMovements(items, ms);
    expect(Math.round(c[2].cost)).toBe(-6003);
    expect(Math.round(c[3].cost)).toBe(-900);
    expect(Math.round(costedStockValue(c))).toBe(-900);
  });

  it('nets a branch transfer to nothing for the company', () => {
    const ms = [mv('purchaseReceipt', 5, 1000, '2026-04-01', 'b1'), mv('transferOut', 2, 0, '2026-04-02', 'tr1'), mv('transferIn', 2, 0, '2026-04-02', 'tr1')];
    // The transfer's own out and in cancel, item by item.
    expect(costs(ms)).toEqual([5000, 0, 0]);
  });
});
