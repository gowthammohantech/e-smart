import { findDate, findTotal, parseReceiptText } from '../domain/parseReceipt';

const BILL = `TAX INVOICE
Precision Components Pvt Ltd
Plot 12, GIDC Vatva, Ahmedabad
GSTIN: 24AABCP1234F1ZQ
Invoice No: PC-2026/1183
Date: 14/05/2026
Steel Ball Bearing 6203 240 118.00 28,320.00
Hex Bolt M10x50 60 420.00 25,200.00
Sub Total 53,520.00
CGST 9% 4,816.80
SGST 9% 4,816.80
Grand Total 63,153.60`;

describe('receipt parsing', () => {
  it('reads the fields off a supplier bill', () => {
    const r = parseReceiptText(BILL, 'purchaseBill');
    const f = Object.fromEntries(r.fields.map((x) => [x.key, x.value]));
    expect(f.vendor).toBe('Precision Components Pvt Ltd');
    expect(f.gstin).toBe('24AABCP1234F1ZQ');
    expect(f.reference).toBe('PC-2026/1183');
    expect(f.date).toBe('2026-05-14');
    expect(f.amount).toBe('63153.60');
    expect(f.tax).toBe('9633.60');
    expect(r.lines).toEqual([
      { name: 'Steel Ball Bearing 6203', quantity: 240, unitPrice: 118, confidence: 0.8 },
      { name: 'Hex Bolt M10x50', quantity: 60, unitPrice: 420, confidence: 0.8 },
    ]);
  });

  it('marks what it could not find for the person to fill in', () => {
    const r = parseReceiptText('Thank you', 'expense');
    expect(r.fields.find((x) => x.key === 'amount')?.confidence).toBe(0);
    expect(r.lines).toEqual([]);
  });

  it('understands the common date formats', () => {
    expect(findDate('Dated 3-1-26')).toBe('2026-01-03');
    expect(findDate('2026-07-09')).toBe('2026-07-09');
    expect(findDate('12 Mar 2026')).toBe('2026-03-12');
  });

  it('prefers the grand total over other totals', () => {
    expect(findTotal(['Total Qty 12', 'Sub Total 1,000.00', 'Total 1,180.00'])?.value).toBe(1180);
    expect(findTotal(['Net Payable ₹ 4,720'])?.value).toBe(4720);
  });
});
