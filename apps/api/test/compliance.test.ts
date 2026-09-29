import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { computeIrn, parseSignedQrPayload } from '@esmart/core/domain/eInvoice';
import { validUptoFor } from '@esmart/core/domain/ewayBill';
import { schema } from '@esmart/db';
import { decrypt } from '../src/lib/crypto';
import type { SimulatedComplianceProvider } from '../src/providers/compliance';
import { simulatedDistanceKm } from '../src/providers/gstin';
import { ownerWithCompany, setupApi, type TestContext } from './helpers';
import { invoiceBody, issueInvoice, line, moneySetup, pdfText, type Money } from './money-fixtures';

const t = setupApi();
const portal = () => t.providers.compliance as SimulatedComplianceProvider;

const SELLER = '27AAPFU0939F1ZV';
const BUYER = '29AABCG4321K1ZM';
const T0 = '2026-09-29T10:00:00.000Z';
const hours = (h: number) => new Date(new Date(T0).getTime() + h * 3_600_000).toISOString();

/** A company above the e-invoicing turnover, clock pinned at T0. */
async function ready(tc: TestContext, over: Record<string, unknown> = {}) {
  const m = await moneySetup(tc);
  tc.setNow(T0);
  portal().clearFaults();
  const res = await tc.put(`${m.c}/compliance-settings`, { annualTurnover: { minor: 60_000_000_00, currency: 'INR' }, ...over }, { token: m.token });
  expect(res.status).toBe(200);
  return m;
}

/** A B2B invoice (to the Bengaluru GSTIN), with HSN codes unless told otherwise. */
const b2b = (m: Money, over: Record<string, unknown> = {}) => issueInvoice(t, m, { partyId: m.bengaluru.id, lines: [line(m.gst(18), { hsnCode: '7214' })], ...over });

/** An invoice for goods worth more than the ₹50,000 e-way bill threshold. */
async function goodsInvoice(m: Money) {
  const rod = await m.item();
  return b2b(m, { lines: [line(m.gst(18), { itemId: rod, hsnCode: '7214', unitPrice: { minor: 50_000_00, currency: 'INR' } })] });
}

const ewayInput = (documentId: string, over: Record<string, unknown> = {}) => ({
  documentId,
  subSupplyType: 'supply',
  transactionType: 1,
  from: { legalName: 'Vertex Traders', gstin: SELLER, address1: '12 Market Road', place: 'Mumbai', pincode: '400001', stateCode: '27' },
  to: { legalName: 'Anand Enterprises', gstin: BUYER, address1: '4 MG Road', place: 'Bengaluru', pincode: '560001', stateCode: '29' },
  transporterId: '27AABCT5512M1Z6',
  transporterName: 'Konkan Roadlines',
  transportMode: 'road',
  vehicleNumber: 'MH04AB1234',
  vehicleType: 'regular',
  distanceKm: 450,
  ...over,
});

describe('compliance: settings and credentials', () => {
  it('saves settings, stores credentials encrypted, and never echoes a secret', async () => {
    const m = await moneySetup(t);
    const initial = await t.get(`${m.c}/compliance-settings`, { token: m.token });
    expect(initial.body).toMatchObject({ companyId: m.companyId, eInvoiceEnabled: true, ewayBillThreshold: { minor: 50_000_00, currency: 'INR' }, irpEnvironment: 'sandbox' });

    const saved = await t.put(
      `${m.c}/compliance-settings`,
      { autoGenerateEInvoiceOnFinalise: true, defaultTransporterId: '27AABCT5512M1Z6', defaultTransporterName: 'Konkan Roadlines', defaultDistanceKm: 300, irpClientIdMasked: 'forged' },
      { token: m.token },
    );
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ autoGenerateEInvoiceOnFinalise: true, defaultTransporterId: '27AABCT5512M1Z6', defaultTransporterName: 'Konkan Roadlines', defaultDistanceKm: 300 });
    expect(saved.body.irpClientIdMasked).toBeUndefined();
    const badMoney = await t.put(`${m.c}/compliance-settings`, { annualTurnover: { minor: 1, currency: 'USD' } }, { token: m.token });
    expect(badMoney.status).toBe(422);

    const secrets = { username: 'vertex_api', password: 's3cret-pass-word', clientId: 'ELXCLIENT12349F21', clientSecret: 'top-secret-value-77' };
    const put = await t.put(`${m.c}/compliance-settings/credentials`, { environment: 'sandbox', gspProvider: 'cleartax', ...secrets }, { token: m.token });
    expect(put.status).toBe(204);
    expect(put.raw).toBe('');

    const after = await t.get(`${m.c}/compliance-settings`, { token: m.token });
    expect(after.body).toMatchObject({ irpUsername: 'vertex_api', irpClientIdMasked: 'ELXC•••••••••9F21' });
    for (const secret of [secrets.password, secrets.clientId, secrets.clientSecret]) expect(after.raw).not.toContain(secret);

    const [stored] = await t.deps.db.select().from(schema.complianceCredentials).where(eq(schema.complianceCredentials.companyId, m.companyId));
    const key = t.deps.config.CREDENTIALS_KEY;
    expect(stored.passwordEncrypted.toString('latin1')).not.toContain(secrets.password);
    expect(decrypt(stored.passwordEncrypted, key)).toBe(secrets.password);
    expect(decrypt(stored.clientSecretEncrypted, key)).toBe(secrets.clientSecret);
    const audit = JSON.stringify(await t.deps.db.select().from(schema.auditEvents).where(eq(schema.auditEvents.companyId, m.companyId)));
    for (const secret of [secrets.password, secrets.clientId, secrets.clientSecret]) expect(audit).not.toContain(secret);

    const test = await t.post(`${m.c}/compliance-settings/test-connection`, {}, { token: m.token });
    expect(test.body).toMatchObject({ irp: { ok: true }, ewb: { ok: true } });
    expect(test.raw).not.toContain(secrets.password);

    await t.deps.db.update(schema.users).set({ role: 'sales' }).where(eq(schema.users.id, m.user.id!));
    const denied = await t.put(`${m.c}/compliance-settings/credentials`, { environment: 'sandbox', ...secrets }, { token: m.token });
    expect(denied.status).toBe(403);
  });
});

describe('compliance: e-invoice', () => {
  it('generates an IRN for a B2B invoice that is core’s SHA-256 derivation, and locks the document', async () => {
    const m = await ready(t);
    const inv = await b2b(m);
    expect(inv.number).toBe('INV/26-27/0001');

    const dry = await t.post(`${m.c}/documents/${inv.id}/e-invoice`, {}, { token: m.token, query: { dryRun: true } });
    expect(dry.status).toBe(200);
    expect(dry.body.payload).toMatchObject({ Version: '1.1', TranDtls: { SupTyp: 'B2B' }, DocDtls: { Typ: 'INV', No: 'INV/26-27/0001', Dt: '29/09/2026' }, BuyerDtls: { Gstin: BUYER } });
    expect((await t.get(`${m.c}/documents/${inv.id}/e-invoice`, { token: m.token })).body.eInvoiceStatus).toBe('pending');

    const res = await t.post(`${m.c}/documents/${inv.id}/e-invoice`, {}, { token: m.token });
    expect(res.status).toBe(200);
    const expected = computeIrn(SELLER, 'INV', 'INV/26-27/0001', '2026-27');
    expect(expected).toBe(createHash('sha256').update(`${SELLER}INVINV/26-27/00012026-27`).digest('hex'));
    expect(res.body).toMatchObject({ ok: true, compliance: { eInvoiceStatus: 'generated', eInvoiceDocType: 'INV', eInvoiceSupplyType: 'B2B', irn: expected, ackDate: '2026-09-29 10:00:00', irnGeneratedAt: T0 } });
    expect(res.body.compliance.ackNo).toMatch(/^[0-9]{16}$/);
    expect(parseSignedQrPayload(res.body.compliance.signedQrPayload)).toMatchObject({ SellerGstin: SELLER, BuyerGstin: BUYER, DocNo: 'INV/26-27/0001', Irn: expected, TotInvVal: 2360 });

    const doc = await t.get(`${m.c}/documents/${inv.id}`, { token: m.token });
    expect(doc.body.compliance).toMatchObject({ eInvoiceStatus: 'generated', irn: expected });
    const edit = await t.patch(`${m.c}/documents/${inv.id}`, invoiceBody(m, { partyId: m.bengaluru.id, notes: 'x' }), { token: m.token });
    expect(edit.status).toBe(409);
    expect(edit.body.code).toBe('DOCUMENT_LOCKED');

    // Asking again returns the IRN the document already has.
    const again = await t.post(`${m.c}/documents/${inv.id}/e-invoice`, {}, { token: m.token });
    expect(again.body.compliance.irn).toBe(expected);
    const listed = await t.get(`${m.c}/documents`, { token: m.token, query: { eInvoiceStatus: 'generated' } });
    expect(listed.body.data.map((d: { id: string }) => d.id)).toEqual([inv.id]);
  });

  it('refuses a line without HSN with 422 and issues, and records the failed attempt', async () => {
    const m = await ready(t);
    const inv = await b2b(m, { lines: [line(m.gst(18))] });
    const res = await t.post(`${m.c}/documents/${inv.id}/e-invoice`, {}, { token: m.token });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('EINVOICE_VALIDATION_FAILED');
    expect(res.body.issues).toEqual(expect.arrayContaining([{ code: '2176', field: 'lines[0].hsnCode', message: '"Steel rod" has no HSN or SAC code', severity: 'blocking' }]));

    const info = await t.get(`${m.c}/documents/${inv.id}/e-invoice`, { token: m.token });
    expect(info.body).toMatchObject({ eInvoiceStatus: 'failed', lastMessage: '"Steel rod" has no HSN or SAC code', lastAttemptAt: T0 });
    expect(info.body.eInvoiceIssues[0].code).toBe('2176');

    // A sale to a consumer is outside e-invoicing altogether.
    const b2c = await issueInvoice(t, m, { lines: [line(m.gst(18), { hsnCode: '7214' })] });
    const na = await t.post(`${m.c}/documents/${b2c.id}/e-invoice`, {}, { token: m.token });
    expect(na.status).toBe(422);
    expect(na.body).toMatchObject({ code: 'EINVOICE_NOT_APPLICABLE', issues: [{ code: 'NA', message: 'A sale to an unregistered buyer is outside e-invoicing' }] });
  });

  it('records a simulated portal rejection as failed, and a retry succeeds', async () => {
    const m = await ready(t);
    const inv = await b2b(m);
    portal().failNext('submitInvoice', '2211');
    const res = await t.post(`${m.c}/documents/${inv.id}/e-invoice`, {}, { token: m.token });
    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ code: 'IRP_REJECTED', issues: [{ code: '2211', severity: 'blocking' }] });

    const info = await t.get(`${m.c}/documents/${inv.id}/e-invoice`, { token: m.token });
    expect(info.body).toMatchObject({ eInvoiceStatus: 'failed', lastMessage: 'The supplier GSTIN is not active on the portal', eInvoiceIssues: [{ code: '2211' }] });
    const [row] = await t.deps.db.select().from(schema.eInvoices).where(eq(schema.eInvoices.documentId, inv.id));
    expect(row).toMatchObject({ status: 'failed', attempts: 1, irn: null });
    expect(row.requestPayload).toMatchObject({ Version: '1.1' });
    const notes = await t.deps.db.select().from(schema.notifications).where(eq(schema.notifications.companyId, m.companyId));
    expect(notes.map((n) => n.title)).toContain('E-invoice rejected');

    const retry = await t.post(`${m.c}/documents/${inv.id}/e-invoice`, {}, { token: m.token });
    expect(retry.status).toBe(200);
    expect(retry.body.compliance).toMatchObject({ eInvoiceStatus: 'generated' });
    expect(retry.body.compliance.lastMessage).toBeUndefined();
    const [after] = await t.deps.db.select().from(schema.eInvoices).where(eq(schema.eInvoices.documentId, inv.id));
    expect(after.attempts).toBe(2);
  });

  it('cancels an IRN inside 24 hours and refuses after', async () => {
    const m = await ready(t);
    const a = await b2b(m);
    const b = await b2b(m);
    await t.post(`${m.c}/documents/${a.id}/e-invoice`, {}, { token: m.token });
    await t.post(`${m.c}/documents/${b.id}/e-invoice`, {}, { token: m.token });

    // The document can't be cancelled while its IRN is live.
    const docCancel = await t.post(`${m.c}/documents/${a.id}/status`, { status: 'cancelled' }, { token: m.token });
    expect(docCancel.status).toBe(409);

    t.setNow(hours(23.9));
    const needsRemark = await t.post(`${m.c}/documents/${a.id}/e-invoice/cancel`, { reasonCode: '4' }, { token: m.token });
    expect(needsRemark.status).toBe(422);
    const ok = await t.post(`${m.c}/documents/${a.id}/e-invoice/cancel`, { reasonCode: '2', remark: 'Wrong rate' }, { token: m.token });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ ok: true, issues: [] });
    const info = await t.get(`${m.c}/documents/${a.id}/e-invoice`, { token: m.token });
    expect(info.body).toMatchObject({ eInvoiceStatus: 'cancelled', irnCancelReasonCode: '2', irnCancelRemark: 'Wrong rate', irnCancelledAt: hours(23.9), lastMessage: 'IRN cancelled on the portal: data entry mistake' });
    const twice = await t.post(`${m.c}/documents/${a.id}/e-invoice/cancel`, { reasonCode: '2' }, { token: m.token });
    expect(twice.status).toBe(409);
    expect((await t.post(`${m.c}/documents/${a.id}/status`, { status: 'cancelled' }, { token: m.token })).status).toBe(200);

    t.setNow(hours(24));
    const late = await t.post(`${m.c}/documents/${b.id}/e-invoice/cancel`, { reasonCode: '1' }, { token: m.token });
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('EINVOICE_CANCEL_WINDOW_CLOSED');
    expect((await t.get(`${m.c}/documents/${b.id}/e-invoice`, { token: m.token })).body.eInvoiceStatus).toBe('generated');
  });

  it('generates the IRN on finalise when the company asks for it, without ever undoing the finalise', async () => {
    const m = await ready(t, { autoGenerateEInvoiceOnFinalise: true });
    const draft = await t.post(`${m.c}/documents`, invoiceBody(m, { partyId: m.bengaluru.id, lines: [line(m.gst(18), { hsnCode: '7214' })] }), { token: m.token });
    const fin = await t.post(`${m.c}/documents/${draft.body.id}/finalize`, {}, { token: m.token });
    expect(fin.status).toBe(200);
    expect(fin.body.document).toMatchObject({ number: 'INV/26-27/0001', status: 'issued', compliance: { eInvoiceStatus: 'generated', irn: computeIrn(SELLER, 'INV', 'INV/26-27/0001', '2026-27') } });
    expect(fin.headers.etag).toBe(`"v${fin.body.document.version}"`);

    // Created already issued: same thing.
    const direct = await b2b(m);
    expect((await t.get(`${m.c}/documents/${direct.id}/e-invoice`, { token: m.token })).body.eInvoiceStatus).toBe('generated');

    // A portal failure leaves the invoice issued and numbered, with the failure on record.
    portal().failNext('submitInvoice', 'SIM001');
    const draft2 = await t.post(`${m.c}/documents`, invoiceBody(m, { partyId: m.bengaluru.id, lines: [line(m.gst(18), { hsnCode: '7214' })] }), { token: m.token });
    const fin2 = await t.post(`${m.c}/documents/${draft2.body.id}/finalize`, {}, { token: m.token });
    expect(fin2.status).toBe(200);
    expect(fin2.body.document).toMatchObject({ number: 'INV/26-27/0003', status: 'issued', compliance: { eInvoiceStatus: 'failed' } });

    // B2C invoices are left alone.
    const b2c = await issueInvoice(t, m, { lines: [line(m.gst(18), { hsnCode: '7214' })] });
    expect((await t.get(`${m.c}/documents/${b2c.id}`, { token: m.token })).body.compliance).toBeUndefined();
  });

  it('keeps other companies out', async () => {
    const m = await ready(t);
    const inv = await b2b(m);
    const other = await ownerWithCompany(t);
    expect((await t.get(`${other.c}/documents/${inv.id}/e-invoice`, { token: other.token })).status).toBe(404);
    expect((await t.post(`${other.c}/documents/${inv.id}/e-invoice`, {}, { token: other.token })).status).toBe(404);
  });
});

describe('compliance: e-way bills', () => {
  it('is valid for one day per 200 km, ending at midnight, and fills the distance when sent as 0', async () => {
    const m = await ready(t);
    const inv = await goodsInvoice(m);
    const res = await t.post(`${m.c}/eway-bills`, ewayInput(inv.id), { token: m.token });
    expect(res.status).toBe(201);
    const bill = res.body.ewayBill;
    // 450 km → 3 days, each ending at midnight: 29 Sep + 3 → the last instant of 2 Oct.
    expect(bill).toMatchObject({
      status: 'active',
      distanceKm: 450,
      validFrom: T0,
      validUpto: '2026-10-02T23:59:59.999Z',
      documentNumber: 'INV/26-27/0001',
      docType: 'INV',
      transporterId: '27AABCT5512M1Z6',
      consignmentValue: { minor: 118_000_00 },
      igst: { minor: 18_000_00 },
      mainHsnCode: '7214',
    });
    expect(bill.ewayBillNumber).toMatch(/^[0-9]{12}$/);
    expect(bill.partBUpdates).toHaveLength(1);
    expect(bill.partBUpdates[0]).toMatchObject({ reasonCode: '1', vehicleNumber: 'MH04AB1234' });

    const doc = await t.get(`${m.c}/documents/${inv.id}`, { token: m.token });
    expect(doc.body.compliance).toMatchObject({ ewayBillStatus: 'generated', ewayBillId: bill.id, ewayBillNumber: bill.ewayBillNumber, ewayBillValidUpto: bill.validUpto });
    const [transporter] = await t.deps.db.select().from(schema.transporters).where(eq(schema.transporters.companyId, m.companyId));
    expect(transporter).toMatchObject({ transporterId: '27AABCT5512M1Z6', name: 'Konkan Roadlines' });

    // One live bill per document.
    const dupe = await t.post(`${m.c}/eway-bills`, ewayInput(inv.id), { token: m.token });
    expect(dupe.status).toBe(422);
    expect(dupe.body.issues[0].code).toBe('EWB002');

    // 200 km is exactly one day; 0 asks for the portal's road distance.
    const short = await t.post(`${m.c}/eway-bills`, ewayInput((await goodsInvoice(m)).id, { distanceKm: 200 }), { token: m.token });
    expect(short.body.ewayBill.validUpto).toBe('2026-09-30T23:59:59.999Z');
    const km = simulatedDistanceKm('400001', '560001');
    const auto = await t.post(`${m.c}/eway-bills`, ewayInput((await goodsInvoice(m)).id, { distanceKm: 0 }), { token: m.token });
    expect(auto.body.ewayBill).toMatchObject({ distanceKm: km, validUpto: validUptoFor(T0, km, 'regular') });

    // Below the threshold, or without a vehicle number, there's no bill.
    const small = await b2b(m);
    const notNeeded = await t.post(`${m.c}/eway-bills`, ewayInput(small.id), { token: m.token });
    expect(notNeeded.status).toBe(422);
    expect(notNeeded.body.issues[0]).toMatchObject({ code: 'EWB001', message: 'The document has no goods on it' });
    const noVehicle = await t.post(`${m.c}/eway-bills`, ewayInput((await goodsInvoice(m)).id, { vehicleNumber: 'mh 04 ab 1234' }), { token: m.token });
    expect(noVehicle.status).toBe(422);
    expect(noVehicle.body.issues[0]).toMatchObject({ code: 'EWB201', field: 'vehicleNumber' });

    const list = await t.get(`${m.c}/eway-bills`, { token: m.token, query: { documentId: inv.id } });
    expect(list.body.data.map((b: { id: string }) => b.id)).toEqual([bill.id]);
    t.setNow('2026-10-01T12:00:00Z');
    const expired = await t.get(`${m.c}/eway-bills`, { token: m.token, query: { status: 'expired' } });
    expect(expired.body.data.map((b: { id: string }) => b.id)).toEqual([short.body.ewayBill.id]);
    expect(expired.body.data[0].status).toBe('expired');

    const pdf = await t.get(`${m.c}/eway-bills/${bill.id}/pdf`, { token: m.token });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdfText(pdf.raw)).toContain(bill.ewayBillNumber);
    expect(pdfText(pdf.raw)).toContain('MH04AB1234');
  });

  it('updates Part-B and extends only inside its window', async () => {
    const m = await ready(t);
    const inv = await goodsInvoice(m);
    const bill = (await t.post(`${m.c}/eway-bills`, ewayInput(inv.id, { distanceKm: 150 }), { token: m.token })).body.ewayBill;
    expect(bill.validUpto).toBe('2026-09-30T23:59:59.999Z');
    const url = `${m.c}/eway-bills/${bill.id}`;

    t.setNow(hours(5));
    const partB = await t.post(`${url}/part-b`, { mode: 'road', vehicleNumber: 'MH12XY9876', vehicleType: 'regular', fromPlace: 'Pune', fromStateCode: '27', reasonCode: '2', remark: 'Breakdown' }, { token: m.token });
    expect(partB.status).toBe(200);
    expect(partB.body.ewayBill).toMatchObject({ vehicleNumber: 'MH12XY9876', validUpto: bill.validUpto });
    expect(partB.body.ewayBill.partBUpdates.map((p: { vehicleNumber: string; reasonCode: string }) => [p.vehicleNumber, p.reasonCode])).toEqual([
      ['MH04AB1234', '1'],
      ['MH12XY9876', '2'],
    ]);
    const badVehicle = await t.post(`${url}/part-b`, { mode: 'road', vehicleNumber: 'nope', vehicleType: 'regular', fromPlace: 'Pune', fromStateCode: '27', reasonCode: '4' }, { token: m.token });
    expect(badVehicle.status).toBe(422);

    const extension = { remainingDistanceKm: 250, reasonCode: '4', transitType: 'inTransit', currentPlace: 'Belagavi', currentPincode: '590001', currentStateCode: '29' };
    // The window opens 8 hours before expiry: 15:59:59.999 on 30 Sep.
    t.setNow('2026-09-30T15:00:00Z');
    const early = await t.post(`${url}/extend`, extension, { token: m.token });
    expect(early.status).toBe(409);
    expect(early.body.code).toBe('EWAY_EXTENSION_WINDOW');

    t.setNow('2026-09-30T20:00:00Z');
    const ext = await t.post(`${url}/extend`, extension, { token: m.token });
    expect(ext.status).toBe(200);
    // 250 km from now → 2 days from 30 Sep, to the end of 2 Oct.
    expect(ext.body.ewayBill.validUpto).toBe('2026-10-02T23:59:59.999Z');
    expect(ext.body.ewayBill.extensions).toEqual([
      expect.objectContaining({ remainingDistanceKm: 250, previousValidUpto: '2026-09-30T23:59:59.999Z', newValidUpto: '2026-10-02T23:59:59.999Z', extendedAt: '2026-09-30T20:00:00.000Z' }),
    ]);
    const doc = await t.get(`${m.c}/documents/${inv.id}`, { token: m.token });
    expect(doc.body.compliance.ewayBillValidUpto).toBe('2026-10-02T23:59:59.999Z');

    // Eight hours after the new expiry, the window has closed; the bill has expired and Part-B is refused too.
    t.setNow('2026-10-03T08:00:01Z');
    expect((await t.post(`${url}/extend`, extension, { token: m.token })).status).toBe(409);
    const stale = await t.post(`${url}/part-b`, { mode: 'road', vehicleNumber: 'MH12XY9876', vehicleType: 'regular', fromPlace: 'Pune', fromStateCode: '27', reasonCode: '4' }, { token: m.token });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('EWAY_BILL_CLOSED');
  });

  it('cancels inside 24 hours, not after, and holds the IRN until the bill is cancelled', async () => {
    const m = await ready(t);
    const inv = await goodsInvoice(m);
    await t.post(`${m.c}/documents/${inv.id}/e-invoice`, {}, { token: m.token });
    const bill = (await t.post(`${m.c}/eway-bills`, ewayInput(inv.id), { token: m.token })).body.ewayBill;
    const other = (await t.post(`${m.c}/eway-bills`, ewayInput((await goodsInvoice(m)).id), { token: m.token })).body.ewayBill;

    const irnFirst = await t.post(`${m.c}/documents/${inv.id}/e-invoice/cancel`, { reasonCode: '3' }, { token: m.token });
    expect(irnFirst.status).toBe(409);
    expect(irnFirst.body.code).toBe('EWAY_BILL_ACTIVE');

    t.setNow(hours(20));
    const res = await t.post(`${m.c}/eway-bills/${bill.id}/cancel`, { reasonCode: '1', remark: 'Raised twice' }, { token: m.token });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, issues: [] });
    const got = await t.get(`${m.c}/eway-bills/${bill.id}`, { token: m.token });
    expect(got.body).toMatchObject({ status: 'cancelled', cancelReasonCode: '1', cancelRemark: 'Raised twice', cancelledAt: hours(20) });
    expect((await t.get(`${m.c}/documents/${inv.id}`, { token: m.token })).body.compliance.ewayBillStatus).toBe('cancelled');
    expect((await t.post(`${m.c}/eway-bills/${bill.id}/part-b`, { mode: 'road', vehicleNumber: 'MH12XY9876', vehicleType: 'regular', fromPlace: 'Pune', fromStateCode: '27', reasonCode: '4' }, { token: m.token })).status).toBe(409);

    // With the bill gone, the IRN can go too.
    expect((await t.post(`${m.c}/documents/${inv.id}/e-invoice/cancel`, { reasonCode: '3' }, { token: m.token })).status).toBe(200);

    t.setNow(hours(24));
    const late = await t.post(`${m.c}/eway-bills/${other.id}/cancel`, { reasonCode: '1' }, { token: m.token });
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('EWAY_CANCEL_WINDOW_CLOSED');

    const outsider = await ownerWithCompany(t);
    expect((await t.get(`${outsider.c}/eway-bills/${other.id}`, { token: outsider.token })).status).toBe(404);
    expect((await t.get(`${outsider.c}/eway-bills`, { token: outsider.token })).body.data).toEqual([]);
  });

  it('returns 502 with the portal code when the EWB portal rejects, and saves nothing', async () => {
    const m = await ready(t);
    const inv = await goodsInvoice(m);
    portal().failNext('submitEwayBill', 'SIM001');
    const res = await t.post(`${m.c}/eway-bills`, ewayInput(inv.id), { token: m.token });
    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ code: 'EWB_REJECTED', issues: [{ code: 'SIM001' }] });
    expect(await t.deps.db.select().from(schema.ewayBills)).toHaveLength(0);
  });
});
