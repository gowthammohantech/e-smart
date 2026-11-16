import i18n from '@esmart/i18n';
import type { EwayBill } from '../../types';
import { fromMajor, zero } from '../../lib/money';
import { code128Symbols, code128Widths, code128Svg } from '../../lib/barcode';
import { buildDocumentHtml, buildEInvoiceHtml } from '../documentHtml';
import { buildEwayBillHtml, ewayBillQrPayload, ewayDateTime } from '../ewayBillHtml';
import { branch, company, doc, einvoiced, ewayBill, LINES, party } from './fixtures/documents';

const en = i18n.getFixedT('en', null);
/**
 * The page's words, so assertions read as the page does: the body only (the stylesheet is in the
 * head), each tag read past character by character and left as a space, `&amp;` as `&`.
 */
const text = (html: string) => {
  const start = html.indexOf('<body');
  const body = start < 0 ? html : html.slice(start);
  let out = '';
  let inTag = false;
  for (const ch of body) {
    if (ch === '<') inTag = true;
    else if (ch === '>' && inTag) {
      inTag = false;
      out += ' ';
    } else if (!inTag) out += ch;
  }
  return out.split('&amp;').join('&').split(/\s+/).join(' ');
};

const place = (over: Partial<EwayBill['from']> = {}): EwayBill['from'] => ({
  legalName: 'Alpha Medi Systems',
  gstin: '33AWRPB5025F1ZU',
  address1: '74/17, Padikuppam Road',
  place: 'Chennai',
  pincode: '600040',
  stateCode: '33',
  ...over,
});

const bill = (over: Partial<EwayBill> = {}): EwayBill => ({
  id: 'ewb1',
  companyId: 'c',
  branchId: 'b',
  ewayBillNumber: '542104336916',
  documentId: 'd',
  documentKind: 'invoice',
  documentNumber: '26-27/Alpha/0240',
  documentDate: '2026-11-11',
  docType: 'INV',
  supplyType: 'outward',
  subSupplyType: 'supply',
  transactionType: 1,
  partyId: 'p',
  from: place(),
  to: place({ legalName: 'K S Pharmacy', gstin: '33AABPM1012H2H', address1: 'No.198 Kamarajar Salai', pincode: '600068' }),
  consignmentValue: fromMajor('58603', 'INR'),
  taxableValue: fromMajor('55812', 'INR'),
  cgst: fromMajor('1395.30', 'INR'),
  sgst: fromMajor('1395.30', 'INR'),
  igst: zero('INR'),
  mainHsnCode: '37011010',
  itemCount: 2,
  transportMode: 'road',
  vehicleNumber: 'TN05BB1867',
  vehicleType: 'regular',
  distanceKm: 10,
  generatedAt: '2026-11-11T11:28:00.000Z',
  generatedBy: 'u',
  validFrom: '2026-11-11T11:28:00.000Z',
  validUpto: '2026-11-12T18:29:59.000Z',
  status: 'active',
  partBUpdates: [],
  extensions: [],
  createdAt: '2026-11-11T11:28:00.000Z',
  updatedAt: '2026-11-11T11:28:00.000Z',
  ...over,
});

describe('Code 128', () => {
  it('pairs the digits of a bill number, checks them and stops', () => {
    // Start C, six pairs, the check, stop.
    expect(code128Symbols('542104336916')).toEqual([105, 54, 21, 4, 33, 69, 16, (105 + 54 + 42 + 12 + 132 + 345 + 96) % 103, 106]);
    // Every symbol is 11 modules wide, the stop 13.
    expect(code128Widths('542104336916').reduce((a, b) => a + b, 0)).toBe(8 * 11 + 13);
    expect(code128Symbols('AB1')[0]).toBe(104);
    expect(code128Svg('542104336916')).toMatch(/^<svg[\s\S]*<rect /);
  });
});

describe('the e-way bill print', () => {
  it('has the bill, the addresses, the goods line by line, the transport and the barcode', () => {
    const d = doc({ ...einvoiced, lines: LINES });
    const html = buildEwayBillHtml({ bill: bill(), document: d });
    const page = text(html);
    expect(page).toContain('e-Way Bill');
    expect(page).toContain('Tax Invoice - 26-27/Alpha/0240');
    expect(page).toContain('11/11/2026'); // document date
    expect(page).toContain('a'.repeat(64)); // the invoice's IRN
    expect(page).toContain('542104336916');
    expect(page).toContain('11/11/2026 04:58:00 PM'); // generated, India time
    expect(page).toContain('12/11/2026 11:59:59 PM'); // valid upto
    expect(page).toContain('Outward - Supply');
    expect(page).toContain('33AWRPB5025F1ZU');
    expect(page).toContain('K S Pharmacy');
    expect(page).toContain('TAMIL NADU');
    expect(page).toContain('04011000'); // a line's HSN
    expect(page).toContain('55,812.00');
    expect(page).toContain('1,395.30');
    expect(page).toContain('TN05BB1867');
    // The QR at the top and the barcode at the foot.
    expect(html.match(/<svg/g)).toHaveLength(2);
  });

  it('without the document prints the one line the portal was sent, and says when it is cancelled', () => {
    const page = text(buildEwayBillHtml({ bill: bill({ status: 'cancelled', cancelledAt: '2026-11-11T12:00:00.000Z' }) }));
    expect(page).toContain('37011010');
    expect(page).toContain('CANCELLED ON 11/11/2026 05:30:00 PM');
  });

  it('names who generated it, and when, in its QR', () => {
    expect(ewayBillQrPayload(bill())).toBe('542104336916/33AWRPB5025F1ZU/11/11/2026 04:58:00 PM');
    expect(ewayBillQrPayload(bill({ supplyType: 'inward' }))).toContain('/33AABPM1012H2H/');
    expect(ewayDateTime('2026-11-11T18:30:00.000Z')).toBe('12/11/2026 12:00:00 AM');
  });
});

describe('the e-invoice print', () => {
  const input = { document: doc(einvoiced), company: company(), party, branch, ewayBill, t: en, language: 'en' as const };

  it('puts the IRN under the title, the QR beside it and the acknowledgement with the number and date', () => {
    const html = buildEInvoiceHtml(input);
    const page = text(html);
    expect(html).toContain('class="titlebar einv-head"');
    expect(page).toMatch(new RegExp(`TAX INVOICE IRN : ${'a'.repeat(64)}`));
    expect(page).toContain('112410000000001');
    expect(page).toContain('381000123456');
    // Once, at the head: not again in a block under the totals.
    expect(html).not.toContain('class="einv"');
    // The signed QR; the bank's UPI QR comes after it.
    expect(html.split('class="upi-qr"')[0].match(/<svg/g)).toHaveLength(1);
  });

  it('keeps a detailed layout detailed, prints any other ruled, and leaves the invoice print as it was', () => {
    expect(buildEInvoiceHtml({ ...input, layout: 'detailed' })).toContain('Taxable');
    expect(buildEInvoiceHtml({ ...input, layout: 'modern' })).toContain('class="titlebar einv-head"');
    expect(buildDocumentHtml({ ...input, layout: 'classic' })).toContain('class="einv"');
    // Not reported: an ordinary invoice.
    expect(buildEInvoiceHtml({ ...input, document: doc() })).not.toContain('class="titlebar einv-head"');
  });
});
