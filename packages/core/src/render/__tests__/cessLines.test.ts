import i18n from '@esmart/i18n';
import { buildDocumentHtml } from '../documentHtml';
import type { InvoiceLayout } from '../invoiceTemplate';
import { branch, company, doc, line, party } from './fixtures/documents';
import { calculateLine, shownCessRate } from '../../domain/lineCalc';
import { money } from '../../lib/money';

const en = i18n.getFixedT('en', null);
const ctx = { regime: 'GST' as const, registered: true, homeStateCode: '33', placeOfSupplyStateCode: '33' };

// 18% GST and 12% cess on ₹1,000, beside a line with no cess.
const cessLine = line({ id: 'c1', name: 'Cola', unit: 'PCS', taxCategoryId: 'gst18', taxRate: 18, hsnCode: '22021010', gst: { cessRate: 12 } });
const plainLine = line({ id: 'c2', name: 'Water', unit: 'PCS', taxCategoryId: 'gst18', taxRate: 18, hsnCode: '22011010' });

const render = (layout: InvoiceLayout, lines = [cessLine, plainLine]) =>
  buildDocumentHtml({ document: doc({ lines }), company: company(), party, branch, t: en, language: 'en', layout });
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

describe('cess on each line', () => {
  it('keeps the cess part of a line apart from its GST', () => {
    const b = calculateLine(cessLine, 'INR', ctx);
    expect(b.taxAmount.minor).toBe(30_000);
    expect(b.cessAmount.minor).toBe(12_000);
    expect(calculateLine(plainLine, 'INR', ctx).cessAmount.minor).toBe(0);
  });

  it('splits cess out of a tax-inclusive price in proportion to the rates', () => {
    const b = calculateLine({ ...cessLine, unitPrice: money(130_000, 'INR'), taxInclusive: true }, 'INR', ctx);
    expect(b.taxable.minor).toBe(100_000);
    expect(b.cessAmount.minor).toBe(12_000);
    expect(b.taxAmount.minor - b.cessAmount.minor).toBe(18_000);
  });

  it('shows cess only on a taxable line', () => {
    expect(shownCessRate(cessLine)).toBe(12);
    expect(shownCessRate(plainLine)).toBe(0);
    expect(shownCessRate({ gst: { cessRate: 12, supplyType: 'exempt' } })).toBe(0);
    expect(shownCessRate({ gst: { cessRate: 12, reimbursement: true } })).toBe(0);
  });

  it('prints the cess rate under the GST rate on the standard page', () => {
    const page = text(render('standard'));
    expect(page).toContain('18% + 12% Cess');
    expect(page.match(/\+ 12% Cess/g)).toHaveLength(1);
  });

  it('gives cess its own columns on the detailed page, GST alone in the tax column', () => {
    const html = render('detailed');
    const row = text(html.match(/<tr>\s*<td class="ctr">1<\/td>[\s\S]*?<\/tr>/)![0]);
    expect(row).toContain('18% ₹180.00 12% ₹120.00 ₹1,300.00');
    expect(text(html)).toContain('Cess');
  });

  it('leaves the detailed page as it was when no line carries cess', () => {
    const html = render('detailed', [plainLine]);
    expect(html).not.toContain('Cess');
  });
});
