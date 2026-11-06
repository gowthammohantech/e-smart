import i18n from '@esmart/i18n';
import type { BusinessDocument, Company, DocumentLine } from '../../types';
import { calculateDocument } from '../../domain/lineCalc';
import { money } from '../../lib/money';
import { buildDocumentHtml, upiPayLink } from '../documentHtml';

const line: DocumentLine = {
  id: 'l1',
  name: 'Widget',
  quantity: 2,
  unit: 'NOS',
  unitPrice: money(50_000, 'INR'),
  discountMode: 'amount',
  discountValue: 0,
  taxCategoryId: 'gst18',
  taxRate: 18,
  taxInclusive: false,
};

function invoice(over: Partial<BusinessDocument> = {}): BusinessDocument {
  const base = {
    id: 'inv',
    companyId: 'c',
    branchId: 'b',
    kind: 'invoice',
    number: 'INV/26-27/0042',
    status: 'issued',
    partyId: 'p',
    date: '2026-11-05',
    currency: 'INR',
    exchangeRate: 1,
    lines: [line],
    documentDiscountMode: 'amount',
    documentDiscountValue: 0,
    charges: money(0, 'INR'),
    applyRoundOff: false,
    attachmentIds: [],
    ...over,
  } as BusinessDocument;
  base.totals = calculateDocument({
    lines: base.lines,
    currency: base.currency,
    baseCurrency: 'INR',
    exchangeRate: 1,
    documentDiscountMode: 'amount',
    documentDiscountValue: 0,
    charges: base.charges,
    applyRoundOff: false,
    taxCategories: [{ id: 'gst18', name: 'GST 18%', rate: 18 } as never],
    taxContext: { regime: 'GST', interState: false } as never,
  });
  return base;
}

const company = (over: Partial<Company> = {}) =>
  ({
    id: 'c',
    name: 'Vertex Traders',
    baseCurrency: 'INR',
    address: { line1: '1 MG Road', city: 'Mumbai', postalCode: '400001', country: 'IN' },
    bankDetails: { bankName: 'HDFC Bank', accountName: 'Vertex Traders', accountNumber: '50200012345678', ifsc: 'HDFC0001234', branch: 'Andheri', upiId: 'vertex@okhdfc' },
    ...over,
  }) as Company;

const render = (doc: BusinessDocument, c: Company, extra: { signatureSrc?: string } = {}) =>
  buildDocumentHtml({ document: doc, company: c, t: i18n.getFixedT('en', null), language: 'en', ...extra });

describe('bank details, UPI and signature on the printed document', () => {
  it('prints the bank block and a UPI QR for the total on an invoice', () => {
    const html = render(invoice(), company());
    expect(html).toContain('Bank details');
    expect(html).toContain('50200012345678');
    expect(html).toContain('HDFC0001234');
    expect(html).toContain('vertex@okhdfc');
    expect(html).toContain('class="upi-qr"');
    expect(html).toContain('<svg');
  });

  it('leaves the bank block off purchase documents and when there is no account', () => {
    expect(render(invoice({ kind: 'purchaseBill' }), company())).not.toContain('Bank details');
    expect(render(invoice(), company({ bankDetails: undefined }))).not.toContain('Bank details');
  });

  it('prints no UPI QR for a document in another currency', () => {
    const html = render(invoice({ currency: 'USD', lines: [{ ...line, unitPrice: money(5_000, 'USD') }] }), company());
    expect(html).toContain('Bank details');
    expect(html).not.toContain('class="upi-qr"');
  });

  it('puts the signature above the signatory line, from a data URI or https only', () => {
    expect(render(invoice(), company(), { signatureSrc: 'data:image/png;base64,AAAA' })).toContain('class="signature" src="data:image/png;base64,AAAA"');
    expect(render(invoice(), company(), { signatureSrc: 'javascript:alert(1)' })).not.toContain('class="signature"');
  });

  it('builds a UPI link any app reads: payee, amount in rupees, the number as the note', () => {
    expect(upiPayLink('vertex@okhdfc', 'Vertex Traders', 118_000, 'INV/26-27/0042')).toBe(
      'upi://pay?pa=vertex@okhdfc&pn=Vertex+Traders&am=1180.00&cu=INR&tn=INV%2F26-27%2F0042',
    );
  });
});

describe('invoice template', () => {
  it('prints the standard page when the business has none', () => {
    const html = render(invoice(), company());
    expect(html).toContain('#007AFF');
    expect(html).toContain('>Disc.<');
    expect(html).toContain('Generated with');
  });

  it('takes the accent colour, drops the optional columns, and prints its own footer', () => {
    const html = render(invoice(), company({ invoiceTemplate: { accentColor: '#0B6E4F', showDiscountColumn: false, showTaxColumn: false, footerText: 'Thank you for your business', compact: true } }));
    expect(html).toContain('#0B6E4F');
    expect(html).not.toContain('#007AFF');
    expect(html).not.toContain('>Disc.<');
    expect(html).toContain('Thank you for your business');
    expect(html).not.toContain('Generated with');
    expect(html).toContain('font-size: 10.5px');
  });

  it('ignores a colour that is not a hex value', () => {
    expect(render(invoice(), company({ invoiceTemplate: { accentColor: 'red;}</style><script>' } }))).toContain('#007AFF');
  });
});
