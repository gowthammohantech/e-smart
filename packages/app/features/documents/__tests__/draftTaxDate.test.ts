import type { DocumentLine, TaxCategory } from '@esmart/core/types';
import { reRated } from '../useDocumentDraft';

// 18% until 30 Sep 2026, 12% from 1 Oct 2026.
const gst: TaxCategory = { id: 'tax_g', companyId: 'c', name: 'GST', type: 'GST', rate: 12, effectiveFrom: '2026-10-01', history: [{ effectiveFrom: '2017-07-01', rate: 18 }] };

const line = (over: Partial<DocumentLine> = {}): DocumentLine => ({
  id: 'ln_1',
  name: 'Steel rod',
  quantity: 1,
  unit: 'NOS',
  unitPrice: { minor: 100000, currency: 'INR' },
  discountMode: 'amount',
  discountValue: 0,
  taxCategoryId: 'tax_g',
  taxRate: 18,
  taxInclusive: false,
  ...over,
});

describe('a draft moved to another date charges the rate in force on it', () => {
  it('moves a line charging its category’s rate to that day’s rate, both ways', () => {
    expect(reRated([line()], [gst], '2026-09-29', '2026-10-05')[0].taxRate).toBe(12);
    expect(reRated([line({ taxRate: 12 })], [gst], '2026-10-05', '2026-09-15')[0].taxRate).toBe(18);
  });

  it('keeps a rate of the line’s own: 0% on a non-taxable supply, or one the category never had then', () => {
    const nil = line({ taxRate: 0 });
    expect(reRated([nil], [gst], '2026-09-29', '2026-10-05')[0]).toBe(nil);
    const own = line({ taxRate: 5 });
    expect(reRated([own], [gst], '2026-09-29', '2026-10-05')[0]).toBe(own);
  });
});
