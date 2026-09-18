import { buildEInvoicePayload } from '@/domain/gst/einvoice/buildPayload';
import { validateEInvoice } from '@/domain/gst/einvoice/validate';
import { EInvoicePayload } from '@/domain/gst/einvoice/schema';
import { BUYER_KA_GSTIN, ITEMS, company, invoice, line, party } from './gstFixtures';

const TODAY = '2026-09-18';

function payloadFor(over: { company?: ReturnType<typeof company>; party?: ReturnType<typeof party>; doc?: ReturnType<typeof invoice> } = {}): EInvoicePayload {
  return buildEInvoicePayload({
    company: over.company ?? company(),
    party: over.party ?? party(),
    doc: over.doc ?? invoice(),
    items: ITEMS,
  });
}

const codes = (payload: EInvoicePayload) => validateEInvoice(payload, { today: TODAY }).map((e) => e.code);

describe('e-invoice validation', () => {
  it('passes a clean B2B invoice', () => {
    expect(validateEInvoice(payloadFor(), { today: TODAY })).toEqual([]);
  });

  it('2211 — the supplier GSTIN is not valid', () => {
    const co = company();
    const payload = payloadFor({
      company: { ...co, taxRegistration: { ...co.taxRegistration!, identifier: '27AAPFU0939F1ZX' } },
    });
    expect(codes(payload)).toContain('2211');
  });

  it('3028 — no buyer GSTIN on a B2B supply', () => {
    const payload = payloadFor();
    payload.BuyerDtls.Gstin = 'URP';
    expect(codes(payload)).toContain('3028');
  });

  it('3029 — the buyer GSTIN fails its check digit', () => {
    const payload = payloadFor({ party: party({ taxId: '27AACCM1234C1ZZ' }) });
    expect(codes(payload)).toContain('3029');
  });

  it('2265 — the buyer state does not match the place of supply', () => {
    const payload = payloadFor();
    payload.BuyerDtls.Pos = '29';
    expect(codes(payload)).toContain('2265');
  });

  it('2176 — HSN is missing or the wrong length', () => {
    const payload = payloadFor({ doc: invoice({ lines: [line({ hsnCode: '12' })] }) });
    expect(codes(payload)).toContain('2176');
  });

  it('2182 — an item value does not add up', () => {
    const payload = payloadFor();
    payload.ItemList[0].AssAmt = payload.ItemList[0].AssAmt + 100;
    expect(codes(payload)).toContain('2182');
  });

  it('2189 — the invoice total does not add up', () => {
    const payload = payloadFor();
    payload.ValDtls.TotInvVal = payload.ValDtls.TotInvVal + 500;
    expect(codes(payload)).toContain('2189');
  });

  it('2172 — CGST and SGST on an inter-state supply', () => {
    const payload = payloadFor();
    payload.BuyerDtls.Pos = '29';
    payload.BuyerDtls.Gstin = BUYER_KA_GSTIN;
    expect(codes(payload)).toContain('2172');
  });

  it('2173 — IGST on an intra-state supply', () => {
    const payload = payloadFor();
    payload.ValDtls.IgstVal = 100;
    expect(codes(payload)).toContain('2173');
  });

  it('2227 — the document is dated in the future', () => {
    const payload = payloadFor({ doc: invoice({ date: '2026-10-01' }) });
    expect(codes(payload)).toContain('2227');
  });

  it('2240 — the document is more than thirty days old', () => {
    const payload = payloadFor({ doc: invoice({ date: '2026-07-01' }) });
    expect(codes(payload)).toContain('2240');
  });

  it('2233 — a PIN code is not six digits', () => {
    const payload = payloadFor({
      party: party({
        billingAddress: {
          line1: '21 Lamington Road',
          city: 'Mumbai',
          state: 'Maharashtra',
          stateCode: '27',
          postalCode: '4007',
          country: 'India',
        },
      }),
    });
    expect(codes(payload)).toContain('2233');
  });

  it('4019 — there are no items', () => {
    const payload = payloadFor();
    payload.ItemList = [];
    expect(codes(payload)).toContain('4019');
  });
});
