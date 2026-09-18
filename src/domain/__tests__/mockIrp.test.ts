import { buildEInvoicePayload } from '@/domain/gst/einvoice/buildPayload';
import { IrpAckRecord, createMockIrp } from '@/domain/gst/einvoice/mockIrp';
import { readSignedQr } from '@/domain/gst/einvoice/qr';
import { ITEMS, company, invoice, party } from './gstFixtures';

const ACK_AT = new Date('2026-09-18T10:00:00.000Z');

function payload(over: Parameters<typeof invoice>[0] = {}) {
  return buildEInvoicePayload({
    company: company(),
    party: party(),
    doc: invoice(over),
    items: ITEMS,
  });
}

function irpAt(iso: string, activeIrns = new Map<string, IrpAckRecord>()) {
  return { irp: createMockIrp({ now: () => new Date(iso), activeIrns }), activeIrns };
}

describe('mock IRP — generate', () => {
  it('registers a clean invoice', () => {
    const { irp } = irpAt(ACK_AT.toISOString());
    const result = irp.generate({ payload: payload(), documentId: 'doc_1' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.irn).toMatch(/^[0-9a-f]{64}$/);
    expect(result.ackNo).toMatch(/^\d{15}$/);
    expect(result.ackDate).toBe('2026-09-18 10:00:00');
  });

  it('returns a QR that verifies and carries the ten fields', () => {
    const { irp } = irpAt(ACK_AT.toISOString());
    const result = irp.generate({ payload: payload(), documentId: 'doc_1' });
    if (!result.ok) throw new Error('expected success');

    const read = readSignedQr(result.signedQrCode);
    expect(read).not.toBeNull();
    expect(read!.Irn).toBe(result.irn);
    expect(read!.DocNo).toBe('INV/2026-27/0001');
    expect(read!.ItemCnt).toBe(1);
    expect(read!.MainHsnCode).toBe('830210');
  });

  it('refuses a tampered QR', () => {
    const { irp } = irpAt(ACK_AT.toISOString());
    const result = irp.generate({ payload: payload(), documentId: 'doc_1' });
    if (!result.ok) throw new Error('expected success');

    const [header, , signature] = result.signedQrCode.split('.');
    expect(readSignedQr(`${header}.eyJJcm4iOiJmYWtlIn0.${signature}`)).toBeNull();
  });

  it('rejects a second registration of the same document with 2150', () => {
    const { irp, activeIrns } = irpAt(ACK_AT.toISOString());
    const first = irp.generate({ payload: payload(), documentId: 'doc_1' });
    if (!first.ok) throw new Error('expected success');

    activeIrns.set(first.irn, { ackDate: first.ackDate, documentId: 'doc_1' });

    const second = irp.generate({ payload: payload(), documentId: 'doc_1' });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.errors[0].code).toBe('2150');
  });

  it('passes validation errors straight through', () => {
    const { irp } = irpAt(ACK_AT.toISOString());
    const bad = payload();
    bad.ItemList = [];
    const result = irp.generate({ payload: bad, documentId: 'doc_1' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.code)).toContain('4019');
  });

  it('can be forced to fail, for exercising the error path', () => {
    const irp = createMockIrp({
      now: () => ACK_AT,
      activeIrns: new Map(),
      behaviour: 'alwaysFail',
      forcedErrorCode: '3029',
    });
    const result = irp.generate({ payload: payload(), documentId: 'doc_1' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].code).toBe('3029');
  });
});

describe('mock IRP — cancel', () => {
  const IRN = 'a'.repeat(64);

  function withIrn(cancelled = false) {
    return new Map<string, IrpAckRecord>([
      [IRN, { ackDate: '2026-09-18 10:00:00', documentId: 'doc_1', cancelled }],
    ]);
  }

  it('cancels inside the 24-hour window', () => {
    const { irp } = irpAt('2026-09-19T09:59:00.000Z', withIrn());
    const result = irp.cancel({ irn: IRN, reasonCode: '2' });
    expect(result.ok).toBe(true);
  });

  it('refuses after 24 hours with 2270', () => {
    const { irp } = irpAt('2026-09-19T10:01:00.000Z', withIrn());
    const result = irp.cancel({ irn: IRN, reasonCode: '2' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].code).toBe('2270');
  });

  it('requires remarks when the reason is "Others"', () => {
    const { irp } = irpAt('2026-09-18T12:00:00.000Z', withIrn());
    expect(irp.cancel({ irn: IRN, reasonCode: '4' }).ok).toBe(false);
    expect(irp.cancel({ irn: IRN, reasonCode: '4', remarks: 'Wrong buyer' }).ok).toBe(true);
  });

  it('will not cancel twice, or cancel an IRN it has never seen', () => {
    const { irp } = irpAt('2026-09-18T12:00:00.000Z', withIrn(true));
    expect(irp.cancel({ irn: IRN, reasonCode: '1' }).ok).toBe(false);

    const { irp: empty } = irpAt('2026-09-18T12:00:00.000Z');
    expect(empty.cancel({ irn: IRN, reasonCode: '1' }).ok).toBe(false);
  });
});
