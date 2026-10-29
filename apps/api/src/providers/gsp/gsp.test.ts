import { describe, expect, it } from 'vitest';
import type { IrpInvoicePayload } from '@esmart/core/domain/eInvoice';
import type { EwbPayload } from '@esmart/core/domain/ewayBill';
import { isValidGstin, setSandboxGstinsAllowed } from '@esmart/core/domain/gstin';
import { loadConfig, type Config } from '../../config';
import type { PortalCredentials } from '../compliance';
import { createGspGateway } from '.';
import { AdaequareGateway } from './adaequare';
import { describeGspError, hasErrorCode, parsePortalDateAny, parsePortalDateTime, toPortalDateTime, unwrapResult, type GspEnvelope } from './envelope';
import { resolveGspGateway } from './provider-name';
import { toGstinRecord } from './taxpayer';
import { GspRequestError, type GspRequest, type GspTransport } from './transport';
import { sandboxDocNo, WhitebooksGateway } from './whitebooks';

const NOW = '2026-09-02T10:00:00.000Z';

const creds: PortalCredentials = { gstin: '29AAGCB1286Q000', username: 'api_user', password: 'hunter2' };

const payload = {
  Version: '1.1',
  TranDtls: { TaxSch: 'GST', SupTyp: 'B2B', RegRev: 'N', IgstOnIntra: 'N' },
  DocDtls: { Typ: 'INV', No: 'INV-1', Dt: '02/09/2026' },
  SellerDtls: { Gstin: '29AAGCB1286Q000', LglNm: 'Seller', Addr1: 'a', Addr2: '', Loc: 'Bengaluru', Pin: 560001, Stcd: '29' },
  BuyerDtls: { Gstin: '27AAGCB1286Q1Z4', LglNm: 'Buyer', Pos: '27', Addr1: 'b', Loc: 'Mumbai', Pin: 400001, Stcd: '27' },
  ItemList: [{ SlNo: '1', PrdDesc: 'Widget', IsServc: 'N', HsnCd: '8501', Qty: 1, Unit: 'NOS', UnitPrice: 100, TotAmt: 100, Discount: 0, AssAmt: 100, GstRt: 18, IgstAmt: 18, CgstAmt: 0, SgstAmt: 0, TotItemVal: 118 }],
  ValDtls: { AssVal: 100, CgstVal: 0, SgstVal: 0, IgstVal: 18, Discount: 0, OthChrg: 0, RndOffAmt: 0, TotInvVal: 118 },
} as unknown as IrpInvoicePayload;

const ewb = {
  supplyType: 'O', subSupplyType: 1, docType: 'INV', docNo: 'INV-1', docDate: '2026-09-02', transactionType: 1,
  fromGstin: '29AAGCB1286Q000', fromTrdName: 'Seller', fromAddr1: 'a', fromPlace: 'Bengaluru', fromPincode: 560001, fromStateCode: '29',
  toGstin: '27AAGCB1286Q1Z4', toTrdName: 'Buyer', toAddr1: 'b', toPlace: 'Mumbai', toPincode: 400001, toStateCode: '27',
  totalValue: 100, cgstValue: 0, sgstValue: 0, igstValue: 18, totInvValue: 118, mainHsnCode: '8501', itemCount: 1,
  transDocNo: 'LR-9', transDocDate: '2026-09-02', transMode: '1', transDistance: 840.4, vehicleNo: 'KA01AB1234', vehicleType: 'R',
} as unknown as EwbPayload;

/** A transport that answers from a route table and remembers what it was asked. */
function fakeTransport(routes: Record<string, (request: GspRequest) => GspEnvelope | Error>) {
  const calls: (GspRequest & { method: 'get' | 'post' })[] = [];
  let authenticated = 0;
  const answer = async (method: 'get' | 'post', request: GspRequest) => {
    calls.push({ ...request, method });
    const route = routes[request.path];
    if (!route) throw new GspRequestError(`no route ${request.path}`, 'http', 404, null);
    const reply = route(request);
    if (reply instanceof Error) throw reply;
    return reply;
  };
  const transport: GspTransport = {
    async authenticate() {
      authenticated += 1;
      return { accessToken: `bearer-${authenticated}`, expiresInSeconds: 3600 };
    },
    get: <T>(request: GspRequest) => answer('get', request) as Promise<GspEnvelope<T>>,
    post: <T>(request: GspRequest) => answer('post', request) as Promise<GspEnvelope<T>>,
  };
  return { transport, calls, authenticated: () => authenticated };
}

const adaequareConfig = (extra: Record<string, string> = {}): Config =>
  loadConfig({ TAXATION_ADAEQUARE_BASE_URL: 'https://gsp.example.test/test/', TAXATION_ADAEQUARE_APP_ID: 'app', TAXATION_ADAEQUARE_APP_SECRET: 'secret', ...extra });

const whitebooksConfig = (extra: Record<string, string> = {}): Config =>
  loadConfig({
    TAXATION_GSP_PROVIDER_CODE: 'WHITE_BOOKS_GSP',
    TAXATION_WHITEBOOKS_BASE_URL: 'https://apisandbox.example.test',
    TAXATION_WHITEBOOKS_ACCOUNT_EMAIL: 'accounts@example.test',
    TAXATION_WHITEBOOKS_IP_ADDRESS: '203.0.113.7',
    TAXATION_WHITEBOOKS_APP_ID: 'GSTS-app',
    TAXATION_WHITEBOOKS_APP_SECRET: 'GSTS-secret',
    TAXATION_WHITEBOOKS_EINVOICE_APP_ID: 'EINS-app',
    TAXATION_WHITEBOOKS_EINVOICE_APP_SECRET: 'EINS-secret',
    TAXATION_WHITEBOOKS_EWAYBILL_APP_ID: 'EWBS-app',
    TAXATION_WHITEBOOKS_EWAYBILL_APP_SECRET: 'EWBS-secret',
    TAXATION_GSTIN_ALLOW_SANDBOX: 'true',
    ...extra,
  });

const nic = (code: string, message: string) => JSON.stringify([{ ErrorCode: code, ErrorMessage: message }]);

describe('envelope helpers', () => {
  it('unpacks the JSON array NIC errors arrive in', () => {
    const envelope = { success: false, message: nic('2150', 'Duplicate IRN') };
    expect(describeGspError(envelope, 'x')).toBe('Duplicate IRN (2150)');
    expect(hasErrorCode(envelope, '2150')).toBe(true);
  });

  it('matches a code on a word boundary, never inside an amount', () => {
    expect(hasErrorCode({ message: 'Total 21500.00 is wrong' }, '2150')).toBe(false);
    expect(hasErrorCode({ message: 'Total 2150 is wrong' }, '2150')).toBe(true);
  });

  it('reads a record whether the gateway wrapped it or answered bare', () => {
    expect(unwrapResult({ success: true, result: { Irn: 'a' } })).toEqual({ Irn: 'a' });
    expect(unwrapResult({ Irn: 'a' } as unknown as GspEnvelope)).toEqual({ Irn: 'a' });
    expect(unwrapResult({ success: true, result: null })).toBeNull();
    expect(unwrapResult({ success: true, result: '{"Irn":"b"}' })).toEqual({ Irn: 'b' });
  });

  it('pins portal dates to IST, in all three spellings', () => {
    expect(parsePortalDateTime('2026-09-02 22:15:00')?.toISOString()).toBe('2026-09-02T16:45:00.000Z');
    expect(parsePortalDateAny('02/09/2026 10:15:00 PM')?.toISOString()).toBe('2026-09-02T16:45:00.000Z');
    expect(parsePortalDateAny('07/09/2026 12:05:00 AM')?.toISOString()).toBe('2026-09-06T18:35:00.000Z');
    expect(parsePortalDateAny('02/09/2026 22:15:00')?.toISOString()).toBe('2026-09-02T16:45:00.000Z');
    expect(toPortalDateTime(new Date('2026-09-02T16:45:00.000Z'))).toBe('2026-09-02 22:15:00');
  });
});

describe('gateway selection', () => {
  it('reads the gateway from the provider code, however it is spelled', () => {
    expect(resolveGspGateway('', 'WHITE_BOOKS_GSP')).toBe('whitebooks');
    expect(resolveGspGateway('', 'whitebooks-gsp')).toBe('whitebooks');
    expect(resolveGspGateway('', 'ADAEQUARE_GSP')).toBe('adaequare');
    expect(resolveGspGateway('', 'SOMETHING_ELSE')).toBe('adaequare');
    expect(resolveGspGateway('whitebooks', 'ADAEQUARE_GSP')).toBe('whitebooks');
  });

  it('builds the gateway the code names, and shares it', () => {
    expect(createGspGateway(adaequareConfig()).gateway).toBe('adaequare');
    const config = whitebooksConfig();
    expect(createGspGateway(config).gateway).toBe('whitebooks');
    expect(createGspGateway(config)).toBe(createGspGateway(config));
  });

  it('refuses a sandbox gateway in production and a sandbox buyer on Adaequare', () => {
    // Whitebooks needs TAXATION_GSTIN_ALLOW_SANDBOX, in production or out of it.
    expect(() => createGspGateway({ ...whitebooksConfig(), TAXATION_GSTIN_ALLOW_SANDBOX: false })).toThrow(/sandbox only/);
    expect(() => createGspGateway({ ...whitebooksConfig(), NODE_ENV: 'production' })).not.toThrow();
    expect(() => createGspGateway(adaequareConfig({ TAXATION_GSTIN_ALLOW_SANDBOX: 'true', TAXATION_SANDBOX_BUYER_GSTIN: '29AWGPV7107B1Z1' }))).toThrow(/TAXATION_SANDBOX_BUYER_GSTIN/);
  });
});

describe('switching provider', () => {
  /** Every provider configured side by side, as in .env; only the code differs. */
  const everything = {
    TAXATION_ADAEQUARE_BASE_URL: 'https://gsp.example.test/',
    TAXATION_ADAEQUARE_APP_ID: 'adq-id',
    TAXATION_ADAEQUARE_APP_SECRET: 'adq-secret',
    TAXATION_WHITEBOOKS_BASE_URL: 'https://apisandbox.example.test',
    TAXATION_WHITEBOOKS_ACCOUNT_EMAIL: 'a@example.test',
    TAXATION_WHITEBOOKS_IP_ADDRESS: '203.0.113.7',
    TAXATION_WHITEBOOKS_EINVOICE_APP_ID: 'wb-id',
    TAXATION_WHITEBOOKS_EINVOICE_APP_SECRET: 'wb-secret',
    // Whitebooks is allowed by this switch alone; switching provider is still the one code.
    TAXATION_GSTIN_ALLOW_SANDBOX: 'true',
  };

  it('changes gateway, host and credentials with the one provider code', async () => {
    const adq = fakeTransport({ '/enriched/ei/api/invoice': () => ({ success: true, result: { Irn: 'A' } }) });
    const wb = fakeTransport({ '/einvoice/authenticate': () => ({ status_cd: '1', data: { AuthToken: 't' } }) as GspEnvelope, '/einvoice/type/GENERATE/version/V1_03': () => ({ status_cd: '1', data: { Irn: 'W' } }) as GspEnvelope });

    const onAdaequare = createGspGateway(loadConfig({ ...everything, TAXATION_GSP_PROVIDER_CODE: 'ADAEQUARE_GSP' }), { transport: adq.transport });
    const onWhitebooks = createGspGateway(loadConfig({ ...everything, TAXATION_GSP_PROVIDER_CODE: 'WHITE_BOOKS_GSP' }), { transport: wb.transport });

    expect(onAdaequare.gateway).toBe('adaequare');
    expect(await onAdaequare.submitInvoice(creds, { payload, existingIrns: [], now: NOW })).toMatchObject({ irn: 'A' });
    expect(adq.calls[0].baseUrl).toBe('https://gsp.example.test/');
    expect(onWhitebooks.gateway).toBe('whitebooks');
    expect(await onWhitebooks.submitInvoice(creds, { payload, existingIrns: [], now: NOW })).toMatchObject({ irn: 'W' });
    expect(wb.calls[0].baseUrl).toBe('https://apisandbox.example.test');
    expect(wb.calls[0].headers).toMatchObject({ client_id: 'wb-id', client_secret: 'wb-secret' });
  });

  it('still reads the platform’s un-prefixed names for anything left blank', () => {
    const config = loadConfig({ TAXATION_GSP_BASE_URL: 'https://old.example.test', TAXATION_GSP_APP_ID: 'i', TAXATION_GSP_APP_SECRET: 's' });
    expect(createGspGateway(config)).toBeInstanceOf(AdaequareGateway);
  });
});

describe('Adaequare', () => {
  const generated = { success: true, result: { Irn: 'IRN1', AckNo: 112010000123456, AckDt: '2026-09-02 15:30:00', SignedQRCode: 'jwt.qr.code' } };

  it('files with the bearer, the taxpayer headers and a payload the portal accepts', async () => {
    const t = fakeTransport({ '/enriched/ei/api/invoice': () => generated });
    const gateway = new AdaequareGateway(adaequareConfig(), t.transport, () => 0);

    const result = await gateway.submitInvoice(creds, { payload, existingIrns: [], now: NOW });

    expect(result).toEqual({ ok: true, irn: 'IRN1', ackNo: '112010000123456', ackDate: '2026-09-02 15:30:00', signedQrPayload: 'jwt.qr.code' });
    const [call] = t.calls;
    expect(call.token).toBe('bearer-1');
    expect(call.baseUrl).toBe('https://gsp.example.test/test/');
    expect(call.headers).toMatchObject({ user_name: 'api_user', password: 'hunter2', gstin: '29AAGCB1286Q000' });
    expect(call.headers?.requestid).toBeTruthy();
    const body = call.body as { SellerDtls: Record<string, unknown>; ItemList: Record<string, unknown>[]; ValDtls: Record<string, unknown> };
    expect(body.SellerDtls).not.toHaveProperty('Addr2');
    expect(body.ItemList[0]).toMatchObject({ CesRt: 0, CesAmt: 0, CesNonAdvlAmt: 0, StateCesRt: 0, StateCesAmt: 0, StateCesNonAdvlAmt: 0 });
    expect(body.ValDtls).toMatchObject({ CesVal: 0, StCesVal: 0 });
  });

  it('exchanges the application credentials once, not once per call', async () => {
    const t = fakeTransport({ '/enriched/ei/api/invoice': () => generated });
    const gateway = new AdaequareGateway(adaequareConfig(), t.transport, () => 0);
    await Promise.all([gateway.submitInvoice(creds, { payload, existingIrns: [], now: NOW }), gateway.submitInvoice(creds, { payload, existingIrns: [], now: NOW })]);
    await gateway.submitInvoice(creds, { payload, existingIrns: [], now: NOW });
    expect(t.authenticated()).toBe(1);
  });

  it('mints a fresh bearer once the first is within a minute of expiring', async () => {
    const t = fakeTransport({ '/enriched/ei/api/invoice': () => generated });
    let now = 0;
    const gateway = new AdaequareGateway(adaequareConfig(), t.transport, () => now);
    await gateway.submitInvoice(creds, { payload, existingIrns: [], now: NOW });
    now = 3600_000 - 30_000;
    await gateway.submitInvoice(creds, { payload, existingIrns: [], now: NOW });
    expect(t.authenticated()).toBe(2);
  });

  it('skips the exchange for a stand-in gateway and sends no bearer', async () => {
    const t = fakeTransport({ '/enriched/ei/api/invoice': () => generated });
    const gateway = new AdaequareGateway(adaequareConfig({ TAXATION_GSP_AUTH_REQUIRED: 'false', TAXATION_GSTIN_ALLOW_SANDBOX: 'true' }), t.transport);
    await gateway.submitInvoice(creds, { payload, existingIrns: [], now: NOW });
    expect(t.authenticated()).toBe(0);
    expect(t.calls[0].token).toBe('');
  });

  it('adopts the existing registration when the portal says 2150', async () => {
    const t = fakeTransport({
      '/enriched/ei/api/invoice': () => new GspRequestError('Duplicate IRN (2150)', 'envelope', 422, { success: false, message: nic('2150', 'Duplicate IRN') }),
      '/enriched/ei/api/invoice/irnbydocdetails': () => ({ success: true, result: { Irn: 'IRN-EXISTING', AckNo: 7, AckDt: '2026-09-01 09:00:00', SignedQRCode: 'qr' } }),
    });
    const gateway = new AdaequareGateway(adaequareConfig(), t.transport);

    const result = await gateway.submitInvoice(creds, { payload, existingIrns: [], now: NOW });

    expect(result).toMatchObject({ ok: true, irn: 'IRN-EXISTING', ackNo: '7' });
    const lookup = t.calls.find((c) => c.path.endsWith('irnbydocdetails'))!;
    expect(lookup.query).toEqual({ doctype: 'INV', docnum: 'INV-1', docdate: '02/09/2026' });
  });

  it('reports a 2150 it cannot recover as the portal said it, and a refusal with every code', async () => {
    const t = fakeTransport({
      '/enriched/ei/api/invoice': () =>
        new GspRequestError('x', 'envelope', 422, { success: false, message: JSON.stringify([{ ErrorCode: '2172', ErrorMessage: 'IGST on intra' }, { ErrorCode: '2176', ErrorMessage: 'HSN missing' }]) }),
    });
    const gateway = new AdaequareGateway(adaequareConfig(), t.transport);
    const result = await gateway.submitInvoice(creds, { payload, existingIrns: [], now: NOW });
    expect(result).toEqual({
      ok: false,
      errors: [
        { code: '2172', field: 'document', message: 'IGST on intra', severity: 'blocking' },
        { code: '2176', field: 'document', message: 'HSN missing', severity: 'blocking' },
      ],
    });
  });

  it('does not count a success that carries no IRN', async () => {
    const t = fakeTransport({ '/enriched/ei/api/invoice': () => ({ success: true }) });
    const result = await new AdaequareGateway(adaequareConfig(), t.transport).submitInvoice(creds, { payload, existingIrns: [], now: NOW });
    expect(result).toMatchObject({ ok: false, errors: [{ code: 'GSP_INCOMPLETE' }] });
  });

  it('does not count a cancellation the portal did not acknowledge', async () => {
    // A catch-all rule answering the *generation* payload is not NIC agreeing to a withdrawal.
    const t = fakeTransport({ '/enriched/ei/api/invoice/cancel': () => generated });
    const result = await new AdaequareGateway(adaequareConfig(), t.transport).cancelIrn(creds, { irn: 'IRN1', irnGeneratedAt: NOW, reasonCode: '2', now: NOW });
    expect(result).toMatchObject({ ok: false, errors: [{ code: 'GSP_INCOMPLETE' }] });
  });

  it('cancels an IRN with the reason as a string', async () => {
    const t = fakeTransport({ '/enriched/ei/api/invoice/cancel': () => ({ success: true, result: { Irn: 'IRN1', CancelDate: '2026-09-02 16:00:00' } }) });
    const result = await new AdaequareGateway(adaequareConfig(), t.transport).cancelIrn(creds, { irn: 'IRN1', irnGeneratedAt: NOW, reasonCode: '2', remark: ' typo ', now: NOW });
    expect(result).toEqual({ ok: true, cancelDate: '2026-09-02 16:00:00', reason: 'Data entry mistake' });
    expect(t.calls[0].body).toEqual({ Irn: 'IRN1', CnlRsn: '2', CnlRem: 'typo' });
  });

  it('cancels an e-way bill with numeric codes, keeping the app’s own reason meaning', async () => {
    const t = fakeTransport({ '/enriched/ei/api/ewayapi': () => ({ success: true, result: { ewbNo: 171012272463, cancelDate: '02/09/2026 10:15:00 PM' } }) });
    const result = await new AdaequareGateway(adaequareConfig(), t.transport).cancelEwayBill(creds, { ewayBillNumber: '171012272463', reasonCode: '3', now: NOW });
    expect(result).toEqual({ ok: true, cancelledAt: '2026-09-02T16:45:00.000Z', reason: 'Data entry mistake' });
    expect(t.calls[0].body).toEqual({ ewbNo: 171012272463, cancelRsnCode: 3 });
  });

  it('raises an e-way bill by IRN with Part B alone', async () => {
    const t = fakeTransport({ '/enriched/ei/api/ewaybill': () => ({ success: true, result: { EwbNo: 171012272463, EwbDt: '02/09/2026 22:15:00', EwbValidTill: '04/09/2026 23:59:00' } }) });
    const result = await new AdaequareGateway(adaequareConfig(), t.transport).submitEwayBill(creds, { payload: ewb, vehicleType: 'regular', now: NOW, irn: 'IRN1' });
    expect(result).toEqual({
      ok: true,
      ewayBillNumber: '171012272463',
      generatedAt: '2026-09-02T16:45:00.000Z',
      validFrom: '2026-09-02T16:45:00.000Z',
      validUpto: '2026-09-04T18:29:00.000Z',
    });
    expect(t.calls[0].body).toEqual({ Irn: 'IRN1', TransMode: '1', TrnDocNO: 'LR-9', TrnDocDt: '02/09/2026', VehNo: 'KA01AB1234', VehType: 'R', Distance: 840 });
  });

  it('raises a bill with no IRN through the standalone API', async () => {
    const t = fakeTransport({ '/enriched/ewb/ewayapi': () => ({ success: true, result: { ewayBillNo: 171012272464, ewayBillDate: '02/09/2026 10:15:00 PM', validUpto: '04/09/2026 11:59:00 PM' } }) });
    const result = await new AdaequareGateway(adaequareConfig(), t.transport).submitEwayBill(creds, { payload: ewb, vehicleType: 'regular', now: NOW });
    expect(result).toMatchObject({ ok: true, ewayBillNumber: '171012272464' });
    expect(t.calls[0].query).toEqual({ action: 'GENEWAYBILL' });
    expect(t.calls[0].body).toMatchObject({ docDate: '02/09/2026', transDistance: '840', fromStateCode: 29 });
  });

  it('files Part B and extension in NIC’s reason codes, not the app’s', async () => {
    const t = fakeTransport({ '/enriched/ewb/ewayapi': () => ({ success: true, result: { vehUpdDate: '02/09/2026 10:15:00 PM', validUpto: '05/09/2026 11:59:00 PM' } }) });
    const gateway = new AdaequareGateway(adaequareConfig(), t.transport);
    await gateway.updatePartB(creds, { ewayBillNumber: '171012272463', mode: 'road', vehicleNumber: 'KA01AB1234', vehicleType: 'regular', fromPlace: 'Pune', fromStateCode: '27', reasonCode: '1', now: NOW });
    expect(t.calls[0].body).toMatchObject({ reasonCode: 4, transMode: '1', vehicleType: 'R' });
    await gateway.updatePartB(creds, { ewayBillNumber: '171012272463', mode: 'road', vehicleNumber: 'KA01AB1234', vehicleType: 'regular', fromPlace: 'Pune', fromStateCode: '27', reasonCode: '2', now: NOW });
    expect(t.calls[1].body).toMatchObject({ reasonCode: 1 });

    const extended = await gateway.extend(creds, {
      bill: { ewayBillNumber: '171012272463', vehicleNumber: 'KA01AB1234', transportMode: 'road' } as never,
      remainingDistanceKm: 120, reasonCode: '5', currentPlace: 'Pune', currentPincode: '411001', currentStateCode: '27', transitType: 'inMovement', now: NOW,
    });
    expect(extended).toEqual({ ok: true, newValidUpto: '2026-09-05T18:29:00.000Z' });
    expect(t.calls[2].body).toMatchObject({ extnRsnCode: 99, consignmentStatus: 'M', remainingDistance: 120 });
  });

  it('answers a refused application as GSP_AUTH, without the gateway’s wording', async () => {
    const t = fakeTransport({});
    t.transport.authenticate = async () => {
      throw new GspRequestError('Application ACME-1 is disabled', 'http', 401, null);
    };
    const result = await new AdaequareGateway(adaequareConfig(), t.transport).submitInvoice(creds, { payload, existingIrns: [], now: NOW });
    expect(result).toMatchObject({ ok: false, errors: [{ code: 'GSP_AUTH', field: 'credentials' }] });
    expect(JSON.stringify(result)).not.toContain('ACME-1');
  });

  it('answers an unreachable gateway as GSP_UNAVAILABLE', async () => {
    const t = fakeTransport({ '/enriched/ei/api/invoice': () => new GspRequestError('ETIMEDOUT', 'transport', undefined, null), '/enriched/ei/api/invoice/irnbydocdetails': () => new GspRequestError('ETIMEDOUT', 'transport', undefined, null) });
    const result = await new AdaequareGateway(adaequareConfig(), t.transport).submitInvoice(creds, { payload, existingIrns: [], now: NOW });
    expect(result).toMatchObject({ ok: false, errors: [{ code: 'GSP_UNAVAILABLE' }] });
  });

  it('names the variable when the application pair is missing, and the step when no login is stored', async () => {
    const t = fakeTransport({});
    const noPair = new AdaequareGateway(loadConfig({ TAXATION_ADAEQUARE_BASE_URL: 'https://gsp.example.test' }), t.transport);
    expect(await noPair.submitInvoice(creds, { payload, existingIrns: [], now: NOW })).toMatchObject({ ok: false, errors: [{ code: 'GSP_NOT_CONFIGURED', message: expect.stringContaining('TAXATION_ADAEQUARE_APP_ID') }] });
    expect(await new AdaequareGateway(adaequareConfig(), t.transport).submitInvoice(null, { payload, existingIrns: [], now: NOW })).toMatchObject({ ok: false, errors: [{ message: 'Store the portal credentials first' }] });
  });

  it('looks a taxpayer up with the bearer only, and reads both ways of “not found”', async () => {
    const t = fakeTransport({
      '/enriched/commonapi/search': (r) =>
        r.query?.gstin === '27AAGCB1286Q1Z4'
          ? { success: true, result: { gstin: '27AAGCB1286Q1Z4', lgnm: 'Buyer Pvt Ltd' } }
          : new GspRequestError('Invalid GSTIN / UID', 'envelope', 502, { success: false, message: nic('SWEB_9035', 'Invalid GSTIN / UID') }),
    });
    const gateway = new AdaequareGateway(adaequareConfig(), t.transport);
    expect(await gateway.lookupTaxpayer('27AAGCB1286Q1Z4')).toEqual({ gstin: '27AAGCB1286Q1Z4', lgnm: 'Buyer Pvt Ltd' });
    expect(await gateway.lookupTaxpayer('29AAGCB1286Q1ZA')).toBeNull();
    expect(t.calls[0].headers).toBeUndefined();
    expect(t.calls[0].query).toEqual({ action: 'TP', gstin: '27AAGCB1286Q1Z4' });
  });

  it('tests the connection without claiming to have checked the portal login', async () => {
    const t = fakeTransport({});
    const result = await new AdaequareGateway(adaequareConfig(), t.transport).testConnection({ einvoice: creds, ewaybill: null });
    expect(result.irp.ok).toBe(true);
    expect(result.ewb).toEqual({ ok: false, message: 'No e-way bill credentials are stored yet' });
    expect(result.irp.message).toMatch(/verified when the first document is filed/);
  });
});

describe('Whitebooks', () => {
  const auth = { irp: 'NIC1', status_cd: '1', status_desc: 'Success', data: { AuthToken: 'tok-1', TokenExpiry: '2026-09-02 18:00:00' } };
  const ok = (data: unknown) => ({ irp: 'NIC1', status_cd: '1', status_desc: 'Success', data }) as GspEnvelope;
  const refusedWith = (code: string, message: string, extra: object = {}) =>
    ({ status_cd: '0', status_desc: JSON.stringify([{ errorCode: code, errorMessage: message }]), ...extra }) as GspEnvelope;
  const at = (iso: string) => () => new Date(iso).getTime();

  it('authenticates the taxpayer, then files under the token', async () => {
    const t = fakeTransport({
      '/einvoice/authenticate': () => auth as GspEnvelope,
      '/einvoice/type/GENERATE/version/V1_03': () => ok({ Irn: 'WB-IRN', AckNo: 99, AckDt: '2026-09-02 15:30:00', SignedQRCode: 'qr' }),
    });
    const gateway = new WhitebooksGateway(whitebooksConfig(), t.transport, at('2026-09-02T10:00:00Z'));

    const result = await gateway.submitInvoice(creds, { payload, existingIrns: [], now: NOW });

    expect(result).toMatchObject({ ok: true, irn: 'WB-IRN', ackNo: '99' });
    const [authCall, filing] = t.calls;
    expect(authCall.query).toEqual({ email: 'accounts@example.test' });
    expect(authCall.headers).toEqual({ client_id: 'EINS-app', client_secret: 'EINS-secret', ip_address: '203.0.113.7', username: 'api_user', password: 'hunter2', gstin: '29AAGCB1286Q000' });
    expect(filing.token).toBe('');
    expect(filing.headers).toEqual({ client_id: 'EINS-app', client_secret: 'EINS-secret', ip_address: '203.0.113.7', username: 'api_user', 'auth-token': 'tok-1', gstin: '29AAGCB1286Q000' });
    expect(filing.headers).not.toHaveProperty('password');
  });

  it('caches the token per taxpayer login, not per application', async () => {
    const t = fakeTransport({
      '/einvoice/authenticate': () => auth as GspEnvelope,
      '/einvoice/type/GENERATE/version/V1_03': () => ok({ Irn: 'WB-IRN' }),
    });
    const gateway = new WhitebooksGateway(whitebooksConfig(), t.transport, at('2026-09-02T10:00:00Z'));
    await gateway.submitInvoice(creds, { payload, existingIrns: [], now: NOW });
    await gateway.submitInvoice(creds, { payload, existingIrns: [], now: NOW });
    expect(t.calls.filter((c) => c.path === '/einvoice/authenticate')).toHaveLength(1);
    await gateway.submitInvoice({ ...creds, gstin: '29AAGCB1286Q001', username: 'other' }, { payload, existingIrns: [], now: NOW });
    expect(t.calls.filter((c) => c.path === '/einvoice/authenticate')).toHaveLength(2);
  });

  it('turns a refusal into the portal’s own codes', async () => {
    const t = fakeTransport({ '/einvoice/authenticate': () => auth as GspEnvelope, '/einvoice/type/GENERATE/version/V1_03': () => refusedWith('3028', 'Invalid buyer GSTIN') });
    const result = await new WhitebooksGateway(whitebooksConfig(), t.transport, at('2026-09-02T10:00:00Z')).submitInvoice(creds, { payload, existingIrns: [], now: NOW });
    expect(result).toEqual({ ok: false, errors: [{ code: '3028', field: 'document', message: 'Invalid buyer GSTIN', severity: 'blocking' }] });
  });

  it('adopts the registration a duplicate refusal carries', async () => {
    const t = fakeTransport({
      '/einvoice/authenticate': () => auth as GspEnvelope,
      '/einvoice/type/GENERATE/version/V1_03': () => refusedWith('2150', 'Duplicate IRN', { info: [{ InfCd: 'DUPIRN', Desc: { Irn: 'WB-EXISTING', AckNo: 5, AckDt: '2026-09-01 09:00:00' } }] }),
    });
    const result = await new WhitebooksGateway(whitebooksConfig(), t.transport, at('2026-09-02T10:00:00Z')).submitInvoice(creds, { payload, existingIrns: [], now: NOW });
    expect(result).toEqual({ ok: true, irn: 'WB-EXISTING', ackNo: '5', ackDate: '2026-09-01 09:00:00', signedQrPayload: '' });
  });

  it('refuses a stored login the portal does not accept, without calling it a gateway failure', async () => {
    const t = fakeTransport({ '/einvoice/authenticate': () => ({ status_cd: '0', status_desc: JSON.stringify([{ errorCode: '1005', errorMessage: 'Invalid Login' }]) }) as GspEnvelope });
    const gateway = new WhitebooksGateway(whitebooksConfig(), t.transport);
    expect(await gateway.submitInvoice(creds, { payload, existingIrns: [], now: NOW })).toMatchObject({ ok: false, errors: [{ code: 'GSP_AUTH', field: 'credentials' }] });
    const tested = await gateway.testConnection({ einvoice: creds, ewaybill: creds });
    expect(tested.irp).toEqual({ ok: false, message: 'Invalid Login (1005)' });
    expect(tested.ewb).toEqual({ ok: false, message: 'Invalid Login (1005)' });
  });

  it('checks each portal with its own login', async () => {
    const seen: string[] = [];
    const t = fakeTransport({
      '/einvoice/authenticate': (r) => {
        seen.push(String(r.headers?.username));
        return (r.headers?.username === 'ewb_user' ? { status_cd: '0', status_desc: JSON.stringify([{ errorCode: '1005', errorMessage: 'Invalid Login' }]) } : auth) as GspEnvelope;
      },
    });
    const tested = await new WhitebooksGateway(whitebooksConfig(), t.transport).testConnection({ einvoice: creds, ewaybill: { ...creds, username: 'ewb_user' } });
    expect(seen).toEqual(['api_user', 'ewb_user']);
    expect(tested.irp.ok).toBe(true);
    expect(tested.ewb).toEqual({ ok: false, message: 'Invalid Login (1005)' });
  });

  it('cancels an IRN on the portal that holds it', async () => {
    const t = fakeTransport({
      '/einvoice/authenticate': () => auth as GspEnvelope,
      '/einvoice/type/CANCEL/version/V1_03': () => ok({ Irn: 'WB-IRN', CancelDate: '2026-09-02 16:00:00' }),
    });
    const result = await new WhitebooksGateway(whitebooksConfig(), t.transport, at('2026-09-02T10:00:00Z')).cancelIrn(creds, { irn: 'WB-IRN', irnGeneratedAt: NOW, reasonCode: '3', now: NOW });
    expect(result).toEqual({ ok: true, cancelDate: '2026-09-02 16:00:00', reason: 'Order cancelled' });
    expect(t.calls[1].query).toEqual({ email: 'accounts@example.test', irp: 'NIC1' });
    expect(t.calls[1].body).toEqual({ Irn: 'WB-IRN', CnlRsn: '3' });
  });

  it('keeps “invoice is not active” a refusal rather than a quiet success', async () => {
    const t = fakeTransport({ '/einvoice/authenticate': () => auth as GspEnvelope, '/einvoice/type/CANCEL/version/V1_03': () => refusedWith('9999', 'Invoice is not active') });
    const result = await new WhitebooksGateway(whitebooksConfig(), t.transport, at('2026-09-02T10:00:00Z')).cancelIrn(creds, { irn: 'WB-IRN', irnGeneratedAt: NOW, reasonCode: '3', now: NOW });
    expect(result).toMatchObject({ ok: false, errors: [{ code: '9999' }] });
  });

  it('raises an e-way bill by IRN under the same session, in Whitebooks’ field names', async () => {
    const t = fakeTransport({
      '/einvoice/authenticate': () => auth as GspEnvelope,
      '/einvoice/type/GENERATE_EWAYBILL/version/V1_03': () => ok({ EwbNo: 171012272463, Status: 'ACT', EwbDt: '2026-09-02 22:15:00', EwbValidTill: '2026-09-04 23:59:00' }),
    });
    const result = await new WhitebooksGateway(whitebooksConfig(), t.transport, at('2026-09-02T10:00:00Z')).submitEwayBill(creds, { payload: ewb, vehicleType: 'regular', now: NOW, irn: 'WB-IRN' });
    expect(result).toMatchObject({ ok: true, ewayBillNumber: '171012272463', generatedAt: '2026-09-02T16:45:00.000Z', validUpto: '2026-09-04T18:29:00.000Z' });
    expect(t.calls[1].body).toMatchObject({ Irn: 'WB-IRN', TransDocNo: 'LR-9', TransDocDt: '02/09/2026' });
    expect(t.calls[1].body).not.toHaveProperty('TrnDocNO');
  });

  it('cancels an e-way bill through the standalone API with no taxpayer session', async () => {
    const t = fakeTransport({ '/ewaybillapi/v1.03/ewayapi/canewb': () => ok({ ewayBillNo: '151012328603', cancelDate: '07/09/2026 02:56:00 PM' }) });
    const result = await new WhitebooksGateway(whitebooksConfig(), t.transport).cancelEwayBill(creds, { ewayBillNumber: '151012328603', reasonCode: '2', now: NOW });
    expect(result).toEqual({ ok: true, cancelledAt: '2026-09-07T09:26:00.000Z', reason: 'Order cancelled' });
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0].headers).toEqual({ client_id: 'EWBS-app', client_secret: 'EWBS-secret', ip_address: '203.0.113.7', gstin: '29AAGCB1286Q000', username: 'api_user' });
    expect(t.calls[0].query).toEqual({ email: 'accounts@example.test', irp: 'NIC1' });
    expect(t.calls[0].body).toEqual({ ewbNo: 151012328603, cancelRsnCode: 2 });
  });

  it('does not count an e-way bill cancellation without a cancel date', async () => {
    const t = fakeTransport({ '/ewaybillapi/v1.03/ewayapi/canewb': () => ok({}) });
    const result = await new WhitebooksGateway(whitebooksConfig(), t.transport).cancelEwayBill(creds, { ewayBillNumber: '151012328603', reasonCode: '2', now: NOW });
    expect(result).toMatchObject({ ok: false, errors: [{ code: 'GSP_INCOMPLETE' }] });
  });

  it('names the missing setting before it calls anything', async () => {
    const t = fakeTransport({});
    const noIp = new WhitebooksGateway(whitebooksConfig({ TAXATION_WHITEBOOKS_IP_ADDRESS: '' }), t.transport);
    expect(await noIp.submitInvoice(creds, { payload, existingIrns: [], now: NOW })).toMatchObject({ ok: false, errors: [{ code: 'GSP_NOT_CONFIGURED', message: expect.stringContaining('TAXATION_WHITEBOOKS_IP_ADDRESS') }] });
    const noPair = new WhitebooksGateway(whitebooksConfig({ TAXATION_WHITEBOOKS_EWAYBILL_APP_ID: '', TAXATION_WHITEBOOKS_EWAYBILL_APP_SECRET: '' }), t.transport);
    expect(await noPair.cancelEwayBill(creds, { ewayBillNumber: '151012328603', reasonCode: '2', now: NOW })).toMatchObject({
      errors: [{ code: 'GSP_NOT_CONFIGURED', message: expect.stringContaining('TAXATION_WHITEBOOKS_EWAYBILL_APP_ID') }],
    });
    expect(t.calls).toHaveLength(0);
  });

  it('files every e-invoice against the sandbox buyer, whole block at a time', async () => {
    const t = fakeTransport({
      '/einvoice/authenticate': () => auth as GspEnvelope,
      '/einvoice/type/GSTNDETAILS/version/V1_03': () =>
        ok({ Gstin: '29AWGPV7107B1Z1', LegalName: 'VISHNU PVT LTD   ', TradeName: ' ', AddrBno: '12', AddrFlno: ' ', AddrBnm: 'Tower B', AddrSt: 'MG Road', AddrLoc: 'Bengaluru', StateCode: 29, AddrPncd: 560001 }),
      '/einvoice/type/GENERATE/version/V1_03': () => ok({ Irn: 'WB-IRN' }),
    });
    const gateway = new WhitebooksGateway(whitebooksConfig({ TAXATION_SANDBOX_BUYER_GSTIN: '29awgpv7107b1z1' }), t.transport, at('2026-09-02T10:00:00Z'));

    await gateway.submitInvoice(creds, { payload, existingIrns: [], now: NOW });
    await gateway.submitInvoice(creds, { payload, existingIrns: [], now: NOW });

    const sent = t.calls.filter((c) => c.path.endsWith('GENERATE/version/V1_03')).map((c) => (c.body as { BuyerDtls: unknown }).BuyerDtls);
    expect(sent[0]).toEqual({ Gstin: '29AWGPV7107B1Z1', LglNm: 'VISHNU PVT LTD', Addr1: '12, Tower B', Addr2: 'MG Road', Loc: 'Bengaluru', Pin: 560001, Stcd: '29', Pos: '27' });
    expect(t.calls.filter((c) => c.path.endsWith('GSTNDETAILS/version/V1_03'))).toHaveLength(1);
  });

  it('reads a taxpayer from the public search with the lookup pair, and “no records” as not found', async () => {
    const t = fakeTransport({
      '/public/search': (r) => (r.query?.gstin === '27AAGCB1286Q2Z3' ? ({ status_cd: '1', data: { gstin: '27AAGCB1286Q2Z3', lgnm: 'Sandbox Co' } } as GspEnvelope) : ({ error: { errorCode: 'FO8000', errorMessage: 'No records found' } } as unknown as GspEnvelope)),
    });
    const gateway = new WhitebooksGateway(whitebooksConfig(), t.transport);
    expect(await gateway.lookupTaxpayer('27AAGCB1286Q2Z3')).toMatchObject({ lgnm: 'Sandbox Co' });
    expect(t.calls[0].headers).toMatchObject({ client_id: 'GSTS-app', client_secret: 'GSTS-secret' });
    // Any GSTIN outside the sandbox register is searched as the first one it knows.
    await gateway.lookupTaxpayer('29AAGCB1286Q1ZA');
    expect(t.calls[1].query?.gstin).toBe('27AAGCB1286Q2Z3');

    const missing = fakeTransport({ '/public/search': () => ({ error: { errorCode: 'FO8000' } }) as unknown as GspEnvelope });
    expect(await new WhitebooksGateway(whitebooksConfig(), missing.transport).lookupTaxpayer('27AAGCB1286Q2Z3')).toBeNull();
  });
});

describe('taxpayer record', () => {
  it('reads GSTN’s public search spelling', () => {
    const record = toGstinRecord(
      { lgnm: 'ACME TRADERS PVT LTD', tradeNam: 'Acme', sts: 'Active', dty: 'Regular', rgdt: '01/07/2017', pradr: { addr: { bno: '12', flno: '2nd', bnm: 'Tower B', st: 'MG Road', loc: 'Indiranagar', dst: 'Bengaluru Urban', pncd: '560038' } } },
      '29AAGCB1286Q1ZA',
    );
    expect(record).toEqual({
      gstin: '29AAGCB1286Q1ZA',
      legalName: 'ACME TRADERS PVT LTD',
      tradeName: 'Acme',
      status: 'Active',
      registrationType: 'regular',
      address: { line1: '12, 2nd, Tower B', line2: 'MG Road', city: 'Bengaluru Urban', state: 'Karnataka', stateCode: '29', postalCode: '560038', country: 'IN' },
      registeredOn: '2017-07-01',
    });
  });

  it('reads NIC’s spelling, maps composition and cancelled, and gives up on a record with no name', () => {
    const record = toGstinRecord({ LegalName: 'Nic Co', Status: 'CANCELLED', dty: 'Composition', AddrBno: '1', AddrLoc: 'Pune', AddrPncd: 411001 }, '27AAGCB1286Q1Z4');
    expect(record).toMatchObject({ legalName: 'Nic Co', status: 'Cancelled', registrationType: 'composition', address: { line1: '1', city: 'Pune', postalCode: '411001' } });
    expect(toGstinRecord({ tradeNam: 'only a trade name' }, '27AAGCB1286Q1Z4')).toBeNull();
  });
});

describe('NIC sandbox GSTINs', () => {
  it('are admitted only when the server says so', () => {
    try {
      setSandboxGstinsAllowed(false);
      expect(isValidGstin('29AAGCB1286Q000')).toBe(false);
      setSandboxGstinsAllowed(true);
      expect(isValidGstin('29AAGCB1286Q000')).toBe(true);
      expect(isValidGstin('99AAGCB1286Q000')).toBe(false);
      expect(isValidGstin('29AAGCB1286Q001')).toBe(false);
    } finally {
      setSandboxGstinsAllowed(false);
    }
  });
});

describe('sandbox document numbers', () => {
  it('shows the portal a stable number of our own, within NIC\'s 16 characters', () => {
    const config = whitebooksConfig();
    const a = sandboxDocNo(config, '29AAGCB1286Q000', 'INV/26-27/0003', '2026-10-29');
    expect(a).toMatch(/^S[0-9A-Z]{11}$/);
    expect(sandboxDocNo(config, '29AAGCB1286Q000', 'INV/26-27/0003', '2026-10-29')).toBe(a);
    expect(sandboxDocNo(config, '29AAGCB1286Q000', 'INV/26-27/0004', '2026-10-29')).not.toBe(a);
    expect(sandboxDocNo({ ...config, PUBLIC_BASE_URL: 'https://other.example.test' }, '29AAGCB1286Q000', 'INV/26-27/0003', '2026-10-29')).not.toBe(a);
  });
});
