import { describe, expect, it } from 'vitest';
import { sandboxRates } from './sandbox';

describe('sandboxRates', () => {
  const body = (item: Record<string, unknown>) => ({ totalValue: 115000, igstValue: 18750, itemList: [item] });

  it('shows a mixed-rate invoice’s blended IGST rate as the nearest GST slab, leaving the totals alone', () => {
    const out = sandboxRates(body({ igstRate: 16.3, cgstRate: 0, sgstRate: 0 })) as { totalValue: number; igstValue: number; itemList: { igstRate: number }[] };
    expect(out.itemList[0].igstRate).toBe(18);
    expect(out.totalValue).toBe(115000);
    expect(out.igstValue).toBe(18750);
  });

  it('snaps CGST and SGST to half slabs', () => {
    const out = sandboxRates(body({ igstRate: 0, cgstRate: 8.15, sgstRate: 8.15 })) as { itemList: { cgstRate: number; sgstRate: number }[] };
    expect(out.itemList[0]).toMatchObject({ cgstRate: 9, sgstRate: 9 });
  });

  it('keeps a rate that is already a slab, and a line with no rates', () => {
    expect((sandboxRates(body({ igstRate: 5 })) as { itemList: { igstRate: number }[] }).itemList[0].igstRate).toBe(5);
    expect((sandboxRates(body({ productName: 'Goods' })) as { itemList: Record<string, unknown>[] }).itemList[0]).toEqual({ productName: 'Goods' });
  });
});
