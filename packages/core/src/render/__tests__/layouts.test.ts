import i18n from '@esmart/i18n';
import { buildDocumentHtml } from '../documentHtml';
import { INVOICE_LAYOUTS, type InvoiceLayout } from '../invoiceTemplate';
import { branch, company, customFields, doc, einvoiced, ewayBill, line, LINES, party } from './fixtures/documents';
import { money } from '../../lib/money';
import { amountInWords } from '../../lib/amountInWords';

const en = i18n.getFixedT('en', null);
const render = (layout: InvoiceLayout, over: Partial<Parameters<typeof buildDocumentHtml>[0]> = {}) =>
  buildDocumentHtml({ document: doc(), company: company(), party, branch, t: en, language: 'en', layout, ...over });

/** Text without tags or entities, so assertions read as the page does. */
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

describe.each(INVOICE_LAYOUTS)('the %s layout prints what the law asks for', (layout) => {
  it('on an e-invoice with TCS, a reimbursement, custom fields and an e-way bill', () => {
    const d = doc({
      ...einvoiced,
      tcs: { section: '206C(1H)', rate: 0.1 },
      customFields: { cf2: 'LR-55' },
      lines: [...LINES, line({ id: 'l4', name: 'Courier at cost', taxRate: 0, hsnCode: undefined, gst: { reimbursement: true } } as never)],
    } as never);
    const html = render(layout, { document: d, ewayBill, customFields });
    const page = text(html);
    expect(page).toContain('33NDTPS4034R2ZC'); // the branch's own GSTIN wins
    expect(page).toContain('33AAACB1234C1Z5'); // the buyer's
    expect(page).toContain('Tamil Nadu'); // place of supply
    expect(page).toContain('a'.repeat(64)); // IRN
    expect(page).toContain('112410000000001'); // ack no
    expect(html).toContain('<svg'); // signed QR
    expect(page).toContain('381000123456'); // e-way bill
    expect(page).toMatch(/TCS collected u\/s 206C @ 0\.1%/);
    expect(page).toContain('Reimbursement of expenses (pure agent');
    expect(page).toContain('Lorry receipt');
    expect(page).toContain('Tier');
    expect(page).toContain('04011000'); // HSN
    expect(page).toContain(amountInWords(d.totals.grandTotal));
  });

  it('titled a tax invoice when the seller is registered', () => {
    expect(text(render(layout))).toMatch(layout === 'standard' ? /INVOICE/ : /TAX INVOICE/);
  });

  it('as a bill of supply for a composition dealer', () => {
    expect(text(render(layout, { company: company({ taxRegistration: { regime: 'GST', identifier: '33NDTPS4034R1ZD', compositionScheme: true } } as never) }))).toContain('BILL OF SUPPLY');
  });

  it('on a credit note, naming the invoice it is against and why', () => {
    const page = text(render(layout, { document: doc({ kind: 'creditNote', noteReason: 'deficiency' }), source: { number: 'SI/2026-27/0030', date: '2026-10-01' } }));
    expect(page).toContain('SI/2026-27/0030');
    expect(page).toContain('Short or faulty supply');
  });

  it('with the cancelled-IRN strip on a cancelled e-invoice', () => {
    expect(text(render(layout, { document: doc({ compliance: { ...einvoiced.compliance, eInvoiceStatus: 'cancelled', irnCancelReasonCode: '2' } } as never) }))).toContain('IRN CANCELLED');
  });

  it('with the reverse-charge tax on a reverse-charge supply', () => {
    const d = doc({ reverseCharge: true });
    expect(d.totals.reverseChargeTax?.minor).toBeGreaterThan(0);
    expect(text(render(layout, { document: d }))).toContain('reverse charge by the recipient');
  });

  it('with the SEZ endorsement on a supply to an SEZ, as it was charged; never on a bill', () => {
    expect(text(render(layout, { document: doc({ sezTax: 'withTax' }) }))).toContain('for authorised operations on payment of integrated tax');
    expect(text(render(layout, { document: doc({ sezTax: 'withoutTax' }) }))).toContain('under bond or letter of undertaking without payment of integrated tax');
    expect(text(render(layout, { document: doc({ kind: 'purchaseBill', sezTax: 'withTax' }) }))).not.toContain('Supply meant for SEZ');
    expect(text(render(layout))).not.toContain('Supply meant for SEZ');
  });

  it('with the proforma disclaimer', () => {
    expect(text(render(layout, { document: doc({ kind: 'proforma' }) }))).toContain('Not a tax invoice');
  });

  it('escapes what the user typed', () => {
    const html = render(layout, { document: doc({ notes: '<script>x</script>', terms: '<b>t</b>' }) });
    expect(html).not.toContain('<script>x');
    expect(html).not.toContain('<b>t</b>');
  });
});

describe('the ready-made layouts', () => {
  it('print the HSN-wise tax table and the tax in words, which the standard page does not', () => {
    for (const layout of ['classic', 'detailed', 'modern'] as const) {
      const page = text(render(layout));
      expect(page).toContain('Total tax amount');
      expect(page).toContain('Tax amount (in words)');
      expect(page).toContain('SGST/UTGST');
    }
    expect(text(render('standard'))).not.toContain('Tax amount (in words)');
  });

  it('switch to IGST columns on an inter-state supply', () => {
    const page = text(render('classic', { document: doc({ placeOfSupplyStateCode: '29' }, true) }));
    expect(page).toContain('IGST');
    expect(page).not.toContain('SGST/UTGST');
  });

  it('leave out the sections the business switched off', () => {
    const page = text(render('classic', { template: { showHsnSummary: false, showBank: false, showDeclaration: false, showCustomerSeal: false } }));
    expect(page).not.toContain('Total tax amount');
    expect(page).not.toContain('987765678765');
    expect(page).not.toContain('Declaration');
    expect(page).not.toContain("Customer's seal");
  });

  it('print the consignee, dispatch-from and PAN/TAN on the detailed layout', () => {
    const page = text(render('detailed'));
    expect(page).toContain('Consignee (ship to)');
    expect(page).toContain('12 Port Road');
    expect(page).toContain('Dispatch from');
    expect(page).toContain('NDTPS4034R'); // PAN, from the GSTIN
    expect(page).toContain('CHES12345A');
    expect(page).toContain('Terms and conditions');
  });

  it("add each detailed line's tax up to the invoice's", () => {
    const html = render('detailed', { document: doc({ lines: [line({ unitPrice: money(3_333, 'INR'), taxCategoryId: 'gst18', taxRate: 18 }), line({ id: 'l2', unitPrice: money(3_333, 'INR'), taxCategoryId: 'gst18', taxRate: 18 }), line({ id: 'l3', unitPrice: money(3_334, 'INR'), taxCategoryId: 'gst18', taxRate: 18 })] }) });
    // 33.33 + 33.33 + 33.34 at 18%: the tax lines share 18.00 as 6.00 each.
    expect(text(html).match(/₹6\.00/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('give a light accent dark text for contrast', () => {
    expect(render('modern')).toMatch(/\.items th \{ background: #C8930B; color: #111111/);
    expect(render('classic')).toMatch(/\.items th \{ background: #13294B; color: #FFFFFF/);
  });

  it("follow one document's layout over the business's", () => {
    const html = render('modern', { company: company({ invoiceTemplate: { layout: 'classic' } } as never) });
    expect(html).toContain('class="cards"');
  });

  it('print in Tamil with the English label under each', () => {
    const page = text(render('classic', { t: i18n.getFixedT('ta', null), language: 'ta' }));
    expect(page).toContain('வாங்குபவர் (பில்)');
    expect(page).toContain('Buyer (bill to)');
  });
});

describe('copies', () => {
  it('label each ready-made copy as Rule 48 names it', () => {
    expect(text(render('classic', { copy: 'original' }))).toContain('ORIGINAL FOR RECIPIENT');
    expect(text(render('modern', { copy: 'duplicate' }))).toContain('DUPLICATE FOR TRANSPORTER');
    expect(text(render('classic'))).not.toContain('ORIGINAL');
  });

  it('print in the page’s language, with the Rule 48 wording after it', () => {
    const ta = { t: i18n.getFixedT('ta', null), language: 'ta' as const };
    expect(text(render('classic', { ...ta, copy: 'original' }))).toContain('பெறுநருக்கான அசல் · ORIGINAL FOR RECIPIENT');
    expect(text(render('modern', { ...ta, copy: 'duplicate' }))).toContain('போக்குவரத்தாளருக்கான இரண்டாம் நகல் · DUPLICATE FOR TRANSPORTER');
    expect(render('standard', { ...ta, copy: 'triplicate' })).toContain('விநியோகிப்பாளருக்கான மூன்றாம் நகல் · TRIPLICATE FOR SUPPLIER</div><div class="head">');
  });

  it('leave the standard original unlabelled and put the others above its head, as before', () => {
    expect(render('standard', { copy: 'original' })).toBe(render('standard'));
    expect(render('standard', { copy: 'triplicate' })).toContain('<div class="muted" style="text-align:right;font-weight:700">TRIPLICATE FOR SUPPLIER</div><div class="head">');
  });

  it.each(INVOICE_LAYOUTS)('print all three, each on a new sheet, on the %s layout', (layout) => {
    const html = render(layout, { copy: 'all' });
    expect(html.match(/<body/g)).toHaveLength(1);
    expect(html.match(/page-break-before:always/g)).toHaveLength(2);
    expect(html).toContain('DUPLICATE FOR TRANSPORTER');
    expect(html).toContain('TRIPLICATE FOR SUPPLIER');
    if (layout !== 'standard') expect(html).toContain('ORIGINAL FOR RECIPIENT');
  });
});

describe('the order an invoice came from', () => {
  it('prints in the ready-made headers and not on the standard page', () => {
    const origin = { number: 'SO/2026-27/0011', date: '2026-11-01', kind: 'salesOrder' as const };
    expect(text(render('classic', { origin }))).toContain('Order / challan SO/2026-27/0011');
    expect(render('standard', { origin })).toBe(render('standard'));
  });
});
