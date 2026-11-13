import { costMovements, costedStockValue, stockValue, stockValueFifo } from '../stockLedger';
import type { Item, StockMovement, StockMovementType } from '../../types';

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

  it('leaves no value in stock once a shortfall is made good (money audit C14)', () => {
    // Sold 10 before any came in (at the ₹9 price then), then 10 bought at ₹15: nothing on hand, nothing in stock.
    const ms = [mv('salesIssue', 10, 900, '2026-04-01', 'inv1'), mv('purchaseReceipt', 10, 1500, '2026-04-02', 'bill1')];
    const costed = costMovements(items, ms);
    expect(Math.round(costedStockValue(costed))).toBe(0);
    // More than the shortfall: what is left is worth the lot's price.
    const more = costMovements(items, [mv('salesIssue', 10, 900, '2026-04-01', 'inv1'), mv('purchaseReceipt', 15, 1500, '2026-04-02', 'bill1')]);
    expect(Math.round(costedStockValue(more))).toBe(7500);
  });

  it('costs stock never priced at the price recorded then, not the item’s price today (money audit C8)', () => {
    const ms = [mv('salesIssue', 2, 700, '2026-04-01', 'inv1')];
    const now = [{ id: 'itm_a', purchasePrice: { minor: 5000, currency: 'INR' } }];
    expect(costMovements(now, ms).map((m) => Math.round(m.cost))).toEqual([-1400]);
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

describe('first in, first out', () => {
  const fifo = (ms: StockMovement[], sourceOf?: (id: string) => string | undefined) => costMovements(items, ms, { sourceOf, method: 'fifo' }).map((m) => Math.round(m.cost));

  it('issues from the oldest lot first', () => {
    // 10 at ₹60, 10 at ₹90; 15 out take all of the first and 5 of the second.
    const ms = [mv('purchaseReceipt', 10, 6000, '2026-04-01', 'bill1'), mv('purchaseReceipt', 10, 9000, '2026-04-02', 'bill2'), mv('salesIssue', 15, 0, '2026-04-03', 'inv1')];
    expect(fifo(ms)).toEqual([60000, 90000, -105000]);
    expect(Math.round(costedStockValue(costMovements(items, ms, { method: 'fifo' })))).toBe(45000);
    // The moving average takes the same 15 at ₹75.
    expect(costs(ms)[2]).toBe(-112500);
  });

  it('brings a sales return back at what its invoice took, and sends a purchase return out of its own bill’s lot', () => {
    const sourceOf = (id: string) => ({ ret1: 'inv1', pr1: 'bill1' })[id];
    const ms = [
      mv('purchaseReceipt', 10, 6000, '2026-04-01', 'bill1'),
      mv('purchaseReceipt', 10, 9000, '2026-04-02', 'bill2'),
      mv('salesIssue', 15, 0, '2026-04-03', 'inv1'), // ₹1,050 for 15: ₹70 each
      mv('salesReturn', 3, 0, '2026-04-04', 'ret1'),
      mv('purchaseReturn', 2, 0, '2026-04-05', 'pr1'), // bill1's lot is gone: the oldest left, at ₹90
    ];
    expect(fifo(ms, sourceOf)).toEqual([60000, 90000, -105000, 21000, -18000]);
  });

  it('values stock that went out short at the last price, and makes it good with the next lot', () => {
    const ms = [mv('purchaseReceipt', 2, 6000, '2026-04-01', 'bill1'), mv('salesIssue', 5, 0, '2026-04-02', 'inv1'), mv('purchaseReceipt', 10, 9000, '2026-04-03', 'bill2')];
    const c = costMovements(items, ms, { method: 'fifo' });
    // 2 at ₹60 and 3 short at ₹60; then 10 in, 3 of them making good what was short: 7 left at ₹90.
    expect(c.map((m) => Math.round(m.cost))).toEqual([12000, -30000, 81000]);
    expect(Math.round(costedStockValue(c))).toBe(63000);
  });

  it('moves no value for a cancelled document', () => {
    const ms = [mv('purchaseReceipt', 10, 6000, '2026-04-01', 'bill1'), mv('salesIssue', 4, 0, '2026-04-02', 'inv1'), mv('salesReturn', 4, 0, '2026-04-02', 'inv1')];
    expect(fifo(ms)).toEqual([60000, 0, 0]);
  });
});

describe('stock value on hand', () => {
  const item = { id: 'itm_a', purchasePrice: { minor: 900, currency: 'INR' } } as Item;
  // Bill A 10 @ ₹100, bill B 10 @ ₹1,000 by mistake, then B cancelled (its reversal carries no cost).
  const ms = () => [
    mv('purchaseReceipt', 10, 10000, '2026-04-01', 'billA'),
    mv('purchaseReceipt', 10, 100000, '2026-04-02', 'billB'),
    mv('adjustment', -10, 0, '2026-04-03', 'billB'),
  ];

  it('leaves a cancelled bill out of the average', () => {
    expect(stockValue(item, ms(), 'INR').minor).toBe(100000);
  });

  it('leaves a cancelled bill out of the FIFO lots', () => {
    expect(stockValueFifo(item, ms(), 'INR').minor).toBe(100000);
  });

  it('does not let a sales return set the price', () => {
    const list = [mv('purchaseReceipt', 10, 10000, '2026-04-01', 'billA'), mv('salesIssue', 2, 0, '2026-04-02', 'inv1'), mv('salesReturn', 2, 90000, '2026-04-03', 'ret1')];
    expect(stockValue(item, list, 'INR').minor).toBe(100000);
    expect(stockValueFifo(item, list, 'INR').minor).toBe(100000);
  });
});
