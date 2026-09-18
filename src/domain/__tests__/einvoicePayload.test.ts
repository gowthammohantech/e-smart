import { buildEInvoicePayload, docTypeFor } from '@/domain/gst/einvoice/buildPayload';
import { toCanonicalJson } from '@/domain/gst/einvoice/schema';
import { eInvoiceApplicability } from '@/domain/gst/applicability';
import { resolveSupplyType } from '@/domain/gst/supplyType';
import { toMajor } from '@/lib/money';
import {
  BUYER_KA_GSTIN,
  ITEMS,
  SELLER_GSTIN,
  company,
  invoice,
  line,
  party,
} from './gstFixtures';

describe('document type mapping', () => {
  it('reports only invoices and credit notes', () => {
    expect(docTypeFor('invoice')).toBe('INV');
    expect(docTypeFor('salesReturn')).toBe('CRN');
    expect(docTypeFor('quote')).toBeNull();
    expect(docTypeFor('salesOrder')).toBeNull();
    expect(docTypeFor('delivery')).toBeNull();
  });
});

describe('e-invoice payload', () => {
  it('carries the supplier, buyer and place of supply', () => {
    const payload = buildEInvoicePayload({
      company: company(),
      party: party(),
      doc: invoice(),
      items: ITEMS,
    });

    expect(payload.Version).toBe('1.1');
    expect(payload.TranDtls.SupTyp).toBe('B2B');
    expect(payload.SellerDtls.Gstin).toBe(SELLER_GSTIN);
    expect(payload.SellerDtls.Stcd).toBe('27');
    expect(payload.BuyerDtls.Pos).toBe('27');
    expect(payload.DocDtls.Typ).toBe('INV');
    expect(payload.DocDtls.Dt).toBe('18/09/2026');
  });

  it('splits into CGST and SGST within the state', () => {
    const payload = buildEInvoicePayload({
      company: company(),
      party: party(),
      doc: invoice(),
      items: ITEMS,
    });

    expect(payload.ValDtls.CgstVal).toBeGreaterThan(0);
    expect(payload.ValDtls.SgstVal).toBeGreaterThan(0);
    expect(payload.ValDtls.IgstVal).toBe(0);
    expect(Math.abs(payload.ValDtls.CgstVal - payload.ValDtls.SgstVal)).toBeLessThanOrEqual(0.01);
  });

  it('uses a single IGST line across a state line', () => {
    const buyer = party({
      taxId: BUYER_KA_GSTIN,
      billingAddress: {
        line1: '4 Residency Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        stateCode: '29',
        postalCode: '560025',
        country: 'India',
      },
    });
    const payload = buildEInvoicePayload({
      company: company(),
      party: buyer,
      doc: invoice({}, { placeOfSupply: '29' }),
      items: ITEMS,
    });

    expect(payload.BuyerDtls.Pos).toBe('29');
    expect(payload.ValDtls.IgstVal).toBeGreaterThan(0);
    expect(payload.ValDtls.CgstVal).toBe(0);
    expect(payload.ValDtls.SgstVal).toBe(0);
  });

  it('agrees with the document totals to the paisa', () => {
    const doc = invoice({
      lines: [line(), line({ id: 'ln_2', itemId: 'itm_2', name: 'Installation service', hsnCode: '995461', quantity: 6, unit: 'HR', unitPrice: { minor: 80000, currency: 'INR' } })],
    });
    const payload = buildEInvoicePayload({ company: company(), party: party(), doc, items: ITEMS });

    expect(payload.ValDtls.TotInvVal).toBe(toMajor(doc.totals.grandTotal));
    expect(payload.ValDtls.AssVal).toBe(toMajor(doc.totals.taxableAmount));

    const itemSum = payload.ItemList.reduce((acc, i) => acc + i.AssAmt, 0);
    expect(Math.round(itemSum * 100) / 100).toBe(payload.ValDtls.AssVal);
  });

  it('marks a service line as a service', () => {
    const doc = invoice({
      lines: [line({ id: 'ln_s', itemId: 'itm_2', name: 'Installation service', hsnCode: '995461', quantity: 4, unit: 'HR' })],
    });
    const payload = buildEInvoicePayload({ company: company(), party: party(), doc, items: ITEMS });
    expect(payload.ItemList[0].IsServc).toBe('Y');
    expect(payload.ItemList[0].HsnCd).toBe('995461');
  });

  it('reports an unregistered buyer as URP', () => {
    const payload = buildEInvoicePayload({
      company: company(),
      party: party({ taxId: undefined, gstRegistrationType: 'unregistered' }),
      doc: invoice(),
      items: ITEMS,
    });
    expect(payload.BuyerDtls.Gstin).toBe('URP');
    expect(payload.TranDtls.SupTyp).toBe('B2C');
  });

  it('serialises to stable bytes whatever order the keys arrive in', () => {
    const a = toCanonicalJson({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } });
    const b = toCanonicalJson({ a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 });
    expect(a).toBe(b);
  });
});

describe('supply type', () => {
  it('classifies by how the buyer is registered', () => {
    expect(resolveSupplyType({ registrationType: 'regular', buyerGstin: 'X' })).toBe('B2B');
    expect(resolveSupplyType({ registrationType: 'unregistered' })).toBe('B2C');
    expect(resolveSupplyType({ registrationType: 'sez', underLut: true })).toBe('SEZWOP');
    expect(resolveSupplyType({ registrationType: 'sez' })).toBe('SEZWP');
    expect(resolveSupplyType({ registrationType: 'overseas', underLut: true })).toBe('EXPWOP');
    expect(resolveSupplyType({ registrationType: 'overseas' })).toBe('EXPWP');
  });
});

describe('applicability', () => {
  const items = ITEMS;

  it('applies to an issued B2B invoice', () => {
    const result = eInvoiceApplicability({ company: company(), party: party(), doc: invoice() });
    expect(result.applicable).toBe(true);
    void items;
  });

  it('does not apply to a B2C supply', () => {
    const result = eInvoiceApplicability({
      company: company(),
      party: party({ taxId: undefined, gstRegistrationType: 'unregistered' }),
      doc: invoice(),
    });
    expect(result.applicable).toBe(false);
    expect(result.reason).toMatch(/B2C/);
  });

  it('does not apply below the turnover threshold', () => {
    const co = company();
    const result = eInvoiceApplicability({
      company: { ...co, taxRegistration: { ...co.taxRegistration!, turnoverSlab: 'under5cr' } },
      party: party(),
      doc: invoice(),
    });
    expect(result.applicable).toBe(false);
    expect(result.reason).toMatch(/₹5 crore/);
  });

  it('does not apply to a draft, a quotation, or a composition dealer', () => {
    const co = company();
    expect(eInvoiceApplicability({ company: co, party: party(), doc: invoice({ status: 'draft' }) }).applicable).toBe(false);
    expect(eInvoiceApplicability({ company: co, party: party(), doc: invoice({ kind: 'quote', status: 'sent' }) }).applicable).toBe(false);
    expect(
      eInvoiceApplicability({
        company: { ...co, taxRegistration: { ...co.taxRegistration!, compositionScheme: true } },
        party: party(),
        doc: invoice(),
      }).applicable,
    ).toBe(false);
  });
});
