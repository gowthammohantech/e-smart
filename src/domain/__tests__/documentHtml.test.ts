import { buildDocumentHtml } from '@/features/documents/documentHtml';
import { buildEInvoicePayload } from '@/domain/gst/einvoice/buildPayload';
import { createMockIrp } from '@/domain/gst/einvoice/mockIrp';
import { ITEMS, company, invoice, line, party } from './gstFixtures';
import { BusinessDocument } from '@/types';

/**
 * The printed invoice is the statutory artefact — a buyer's accountant reads
 * this, not the app. These assert the blocks the law requires are actually on
 * the page.
 */
function registered(): BusinessDocument {
  const doc = invoice();
  const payload = buildEInvoicePayload({ company: company(), party: party(), doc, items: ITEMS });
  const irp = createMockIrp({ now: () => new Date('2026-09-18T10:00:00.000Z'), activeIrns: new Map() });
  const result = irp.generate({ payload, documentId: doc.id });
  if (!result.ok) throw new Error(`seed IRP rejected the fixture: ${result.errors[0].message}`);

  return {
    ...doc,
    compliance: {
      eInvoice: {
        status: 'generated',
        irn: result.irn,
        ackNo: result.ackNo,
        ackDate: result.ackDate,
        signedQrPayload: result.signedQrCode,
      },
      eWayBill: {
        status: 'generated',
        ewbNo: '123456789012',
        ewbDate: '2026-09-18T06:00:00.000Z',
        validUpto: '2026-09-21T00:00:00.000Z',
        distanceKm: 450,
        cargo: 'regular',
        partB: { transMode: '1', vehicleNo: 'MH12AB1234', vehicleType: 'R' },
      },
    },
  };
}

const render = (doc: BusinessDocument) =>
  buildDocumentHtml({ document: doc, company: company(), party: party(), branchName: 'Head office' });

describe('printed tax invoice', () => {
  it('carries the seller and buyer GSTINs, grouped for reading', () => {
    const html = render(invoice());
    expect(html).toContain('27 AACCM1234C 1Z2');
    expect(html).toContain('GSTIN');
  });

  it('prints HSN, the tax split and the place of supply', () => {
    const html = render(invoice());
    expect(html).toContain('HSN/SAC 830210');
    expect(html).toContain('CGST 9%');
    expect(html).toContain('SGST 9%');
    expect(html).toContain('Maharashtra');
  });

  it('prints the amount in words on the Indian scale', () => {
    const html = render(invoice());
    expect(html).toContain('Amount in words');
    // 100 hinges at 250 plus 18 per cent.
    expect(html).toContain('Twenty-nine thousand five hundred rupees only');
  });

  it('prints the IRN, acknowledgement and e-way bill blocks once registered', () => {
    const doc = registered();
    const html = render(doc);

    expect(html).toContain('E-invoice');
    expect(html).toContain(doc.compliance!.eInvoice!.irn!);
    expect(html).toContain(doc.compliance!.eInvoice!.ackNo!);
    expect(html).toContain('E-way bill');
    expect(html).toContain('123456789012');
    expect(html).toContain('MH12AB1234');
    expect(html).toContain('450 km');
  });

  it('leaves the compliance blocks out when there is nothing to report', () => {
    const html = render(invoice());
    expect(html).not.toContain('Ack no.');
    expect(html).not.toContain('E-way bill');
  });

  it('marks an unregistered buyer as URP rather than leaving it blank', () => {
    const b2c = buildDocumentHtml({
      document: invoice(),
      company: company(),
      party: party({ taxId: undefined, gstRegistrationType: 'unregistered' }),
    });
    expect(b2c).toContain('Unregistered (URP)');
  });

  it('flags reverse charge when the recipient owes the tax', () => {
    expect(render(invoice({ reverseCharge: true }))).toContain('Reverse charge');
    expect(render(invoice())).not.toContain('Reverse charge');
  });

  it('escapes anything a customer typed', () => {
    const html = render(
      invoice({ lines: [line({ name: '<script>alert(1)</script>' })], notes: 'A & B "quoted"' }),
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A &amp; B &quot;quoted&quot;');
  });
});
