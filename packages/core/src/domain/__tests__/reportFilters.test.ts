import { partyInFilter, taxByHead } from '../reports';
import { money } from '../../lib/money';
import type { BusinessDocument } from '../../types';

describe('report filters and tax heads', () => {
  it('keeps one contact, several, or every one', () => {
    expect(partyInFilter({}, 'a')).toBe(true);
    expect(partyInFilter({ partyId: 'a' }, 'a')).toBe(true);
    expect(partyInFilter({ partyId: 'a' }, 'b')).toBe(false);
    expect(partyInFilter({ partyIds: ['a', 'b'] }, 'b')).toBe(true);
    expect(partyInFilter({ partyIds: ['a', 'b'] }, 'c')).toBe(false);
    expect(partyInFilter({ partyIds: [] }, 'c')).toBe(true);
  });

  it('splits a document’s tax by head, leaving out reverse-charge tax', () => {
    const inr = (minor: number) => money(minor, 'INR');
    const c = (type: string, minor: number) => ({ type, label: type, rate: 9, amount: inr(minor) });
    const doc = {
      currency: 'INR',
      totals: {
        taxLines: [
          { categoryId: 'g18', categoryName: 'GST 18%', rate: 18, taxableAmount: inr(10000), components: [c('CGST', 900), c('SGST', 900)] },
          { categoryId: 'g28', categoryName: 'GST 28%', rate: 28, taxableAmount: inr(10000), components: [c('IGST', 2800), c('CESS', 1200)] },
          { categoryId: 'rcm', categoryName: 'GST 5%', rate: 5, taxableAmount: inr(10000), reverseCharge: true, components: [c('IGST', 500)] },
        ],
      },
    } as unknown as BusinessDocument;
    expect(taxByHead(doc)).toEqual({ igst: inr(2800), cgst: inr(900), sgst: inr(900), cess: inr(1200) });
  });
});
