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

describe('quantities on the printed document', () => {
  it('prints each quantity with its unit\'s short name', () => {
    const html = render(invoice({ lines: [{ ...line, quantity: 5, unit: 'NOS' }] }), company());
    expect(html).toContain('5 Nos');
    expect(html).not.toContain('5 NOS');
  });
});

describe('cess by item on the printed document', () => {
  const withCess = (lines: DocumentLine[]) => {
    const doc = invoice({ lines });
    doc.totals = calculateDocument({
      lines,
      currency: 'INR',
      baseCurrency: 'INR',
      exchangeRate: 1,
      documentDiscountMode: 'amount',
      documentDiscountValue: 0,
      charges: money(0, 'INR'),
      applyRoundOff: false,
      taxCategories: [{ id: 'gst28', name: 'GST 28%', rate: 28 } as never],
      taxContext: { regime: 'GST', homeStateCode: '27', placeOfSupplyStateCode: '27', registered: true },
    });
    return doc;
  };
  const cessLine = (id: string, name: string, minor: number): DocumentLine => ({ ...line, id, name, quantity: 1, unitPrice: money(minor, 'INR'), taxCategoryId: 'gst28', taxRate: 28, hsnCode: '2402', gst: { cessRate: 12 } });

  it('lists each item with the value its cess is on and its share', () => {
    const html = render(withCess([cessLine('a', 'Cigarettes', 100_000), cessLine('b', 'Cigars', 50_000)]), company());
    const table = html.slice(html.indexOf('Cess by item'));
    expect(table).toMatch(/Cigarettes[\s\S]*HSN 2402[\s\S]*1,000\.00[\s\S]*12%[\s\S]*120\.00/);
    expect(table).toMatch(/Cigars[\s\S]*500\.00[\s\S]*12%[\s\S]*60\.00/);
  });

  it('prints no cess table when nothing carries cess', () => {
    expect(render(invoice(), company())).not.toContain('Cess by item');
  });
});
