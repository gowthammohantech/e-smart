import type { DocumentLine } from '@esmart/core/types';
import { money } from '@esmart/core/lib/money';
import { inclusiveState, newLineInclusive } from '../features/documents/useDocumentDraft';

const line = (over: Partial<DocumentLine> = {}): DocumentLine => ({
  id: Math.random().toString(36).slice(2),
  name: 'Widget',
  quantity: 1,
  unit: 'NOS',
  unitPrice: money(10000, 'INR'),
  discountMode: 'amount',
  discountValue: 0,
  taxCategoryId: 'tc_18',
  taxRate: 18,
  taxInclusive: false,
  ...over,
});

describe('the whole-document tax-inclusive switch', () => {
  it('reads all-exclusive, all-inclusive and mixed lines', () => {
    expect(inclusiveState([])).toBe('exclusive');
    expect(inclusiveState([line(), line()])).toBe('exclusive');
    expect(inclusiveState([line({ taxInclusive: true }), line({ taxInclusive: true })])).toBe('inclusive');
    expect(inclusiveState([line({ taxInclusive: true }), line()])).toBe('mixed');
  });

  it('leaves reimbursements out: they are never tax-inclusive', () => {
    const reimbursement = line({ gst: { reimbursement: true } });
    expect(inclusiveState([line({ taxInclusive: true }), reimbursement])).toBe('inclusive');
    expect(newLineInclusive(reimbursement, { pricesIncludeTax: true }).taxInclusive).toBe(false);
  });

  it('starts a new line as the switch says', () => {
    expect(newLineInclusive(line(), { pricesIncludeTax: true }).taxInclusive).toBe(true);
    expect(newLineInclusive(line(), { pricesIncludeTax: false }).taxInclusive).toBe(false);
    expect(newLineInclusive(line(), {}).taxInclusive).toBe(false);
  });
});
