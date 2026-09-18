import { B2CL_THRESHOLD_MINOR, gstr1Summary } from '@/domain/gst/returns';
import { fromMajor } from '@/lib/money';
import { ITEMS, company, invoice, line, party } from './gstFixtures';

const KA_ADDRESS = {
  line1: '4 Residency Road',
  city: 'Bengaluru',
  state: 'Karnataka',
  stateCode: '29',
  postalCode: '560025',
  country: 'India',
};

describe('GSTR-1', () => {
  const co = company();

  it('puts a registered buyer in B2B', () => {
    const summary = gstr1Summary({
      company: co,
      documents: [invoice()],
      parties: [party()],
      items: ITEMS,
      currency: 'INR',
    });

    expect(summary.b2b).toHaveLength(1);
    expect(summary.b2b[0].rate).toBe(18);
    expect(summary.b2b[0].cgst.minor).toBeGreaterThan(0);
    expect(summary.b2cs).toHaveLength(0);
    expect(summary.totals.documents).toBe(1);
  });

  it('puts a credit note to a registered buyer in CDNR', () => {
    const summary = gstr1Summary({
      company: co,
      documents: [invoice({ id: 'doc_2', kind: 'salesReturn', number: 'CRN/2026-27/0001', status: 'processed' })],
      parties: [party()],
      items: ITEMS,
      currency: 'INR',
    });

    expect(summary.cdnr).toHaveLength(1);
    expect(summary.b2b).toHaveLength(0);
  });

  it('splits unregistered buyers between B2CL and B2CS by value and state', () => {
    const walkIn = party({ id: 'cus_2', taxId: undefined, gstRegistrationType: 'unregistered' });
    const outOfState = party({
      id: 'cus_3',
      taxId: undefined,
      gstRegistrationType: 'unregistered',
      billingAddress: KA_ADDRESS,
    });

    const small = invoice({ id: 'doc_s', partyId: 'cus_2' });
    // Comfortably past ₹2.5 lakh, and out of state.
    const large = invoice(
      { id: 'doc_l', partyId: 'cus_3', lines: [line({ quantity: 2000 })] },
      { placeOfSupply: '29' },
    );
    expect(large.totals.grandTotal.minor).toBeGreaterThan(B2CL_THRESHOLD_MINOR);

    const summary = gstr1Summary({
      company: co,
      documents: [small, large],
      parties: [walkIn, outOfState],
      items: ITEMS,
      currency: 'INR',
    });

    expect(summary.b2cs.map((r) => r.documentId)).toEqual(['doc_s']);
    expect(summary.b2cl.map((r) => r.documentId)).toEqual(['doc_l']);
    expect(summary.b2cl[0].igst.minor).toBeGreaterThan(0);
  });

  it('leaves drafts and cancelled documents out of the return', () => {
    const summary = gstr1Summary({
      company: co,
      documents: [
        invoice({ id: 'd1', status: 'draft' }),
        invoice({ id: 'd2', status: 'cancelled' }),
        invoice({ id: 'd3', kind: 'quote', status: 'sent' }),
      ],
      parties: [party()],
      items: ITEMS,
      currency: 'INR',
    });

    expect(summary.totals.documents).toBe(0);
    expect(summary.b2b).toHaveLength(0);
  });

  it('rolls quantities and values up by HSN', () => {
    const twoLines = invoice({
      lines: [
        line({ id: 'a', quantity: 10 }),
        line({ id: 'b', quantity: 15 }),
        line({
          id: 'c',
          itemId: 'itm_2',
          name: 'Installation service',
          hsnCode: '995461',
          unit: 'HR',
          quantity: 4,
          unitPrice: fromMajor('800', 'INR'),
        }),
      ],
    });

    const summary = gstr1Summary({
      company: co,
      documents: [twoLines],
      parties: [party()],
      items: ITEMS,
      currency: 'INR',
    });

    expect(summary.hsn).toHaveLength(2);
    const hinges = summary.hsn.find((h) => h.hsnCode === '830210')!;
    expect(hinges.quantity).toBe(25);
    expect(hinges.taxableValue.minor).toBe(25 * 250 * 100);
  });

  it('totals the taxable value and the tax across every table', () => {
    const summary = gstr1Summary({
      company: co,
      documents: [invoice()],
      parties: [party()],
      items: ITEMS,
      currency: 'INR',
    });

    const doc = invoice();
    expect(summary.totals.taxableValue.minor).toBe(doc.totals.taxableAmount.minor);
    expect(summary.totals.tax.minor).toBe(doc.totals.totalTax.minor);
  });
});
