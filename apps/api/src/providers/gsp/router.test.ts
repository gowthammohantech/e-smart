import { describe, expect, it } from 'vitest';
import type { IrpInvoicePayload } from '@esmart/core/domain/eInvoice';
import { loadConfig } from '../../config';
import { isUnsupported, type PortalCredentials } from '../compliance';
import { createGspRouter, gspAvailability, GspRouter, parseGspGateway } from '.';
import type { GspEnvelope } from './envelope';
import { GspRequestError, type GspRequest, type GspTransport } from './transport';

const NOW = '2026-09-02T10:00:00.000Z';
const base: Omit<PortalCredentials, 'gspGateway'> = { gstin: '29AAGCB1286Q000', username: 'api_user', password: 'hunter2' };

const payload = {
  Version: '1.1',
  TranDtls: { TaxSch: 'GST', SupTyp: 'B2B', RegRev: 'N', IgstOnIntra: 'N' },
  DocDtls: { Typ: 'INV', No: 'INV-1', Dt: '02/09/2026' },
  SellerDtls: { Gstin: '29AAGCB1286Q000', LglNm: 'Seller', Addr1: 'a', Addr2: '', Loc: 'Bengaluru', Pin: 560001, Stcd: '29' },
  BuyerDtls: { Gstin: '27AAGCB1286Q1Z4', LglNm: 'Buyer', Pos: '27', Addr1: 'b', Loc: 'Mumbai', Pin: 400001, Stcd: '27' },
  ItemList: [{ SlNo: '1', PrdDesc: 'Widget', IsServc: 'N', HsnCd: '8501', Qty: 1, Unit: 'NOS', UnitPrice: 100, TotAmt: 100, Discount: 0, AssAmt: 100, GstRt: 18, IgstAmt: 18, CgstAmt: 0, SgstAmt: 0, TotItemVal: 118 }],
  ValDtls: { AssVal: 100, CgstVal: 0, SgstVal: 0, IgstVal: 18, Discount: 0, OthChrg: 0, RndOffAmt: 0, TotInvVal: 118 },
} as unknown as IrpInvoicePayload;

/** One transport behind both gateways, so a test sees which host and which application each call used. */
function bothGateways() {
  const calls: (GspRequest & { method: 'get' | 'post' })[] = [];
  const authenticated: string[] = [];
  const routes: Record<string, (request: GspRequest) => GspEnvelope> = {
    // Adaequare
    '/enriched/ei/api/invoice': () => ({ success: true, result: { Irn: 'ADQ-IRN', AckNo: 1, AckDt: '2026-09-02 15:30:00', SignedQRCode: 'qr' } }),
    // Whitebooks
    '/einvoice/authenticate': () => ({ status_cd: '1', data: { AuthToken: 'wb-token', Sek: 's' } }) as GspEnvelope,
    '/einvoice/type/GENERATE/version/V1_03': () => ({ status_cd: '1', data: { Irn: 'WB-IRN', AckNo: 2, AckDt: '2026-09-02 15:30:00', SignedQRCode: 'qr' } }) as GspEnvelope,
  };
  const answer = async (method: 'get' | 'post', request: GspRequest) => {
    calls.push({ ...request, method });
    const route = routes[request.path];
    if (!route) throw new GspRequestError(`no route ${request.path}`, 'http', 404, null);
    return route(request);
  };
  const transport: GspTransport = {
    async authenticate(request) {
      authenticated.push(request.baseUrl);
      return { accessToken: `bearer-${authenticated.length}`, expiresInSeconds: 3600 };
    },
    get: <T>(request: GspRequest) => answer('get', request) as Promise<GspEnvelope<T>>,
    post: <T>(request: GspRequest) => answer('post', request) as Promise<GspEnvelope<T>>,
  };
  return { transport, calls, authenticated };
}

/** Both providers configured side by side, as in .env; only the default differs. */
const everything = {
  TAXATION_ADAEQUARE_BASE_URL: 'https://gsp.example.test/',
  TAXATION_ADAEQUARE_APP_ID: 'adq-id',
  TAXATION_ADAEQUARE_APP_SECRET: 'adq-secret',
  TAXATION_WHITEBOOKS_BASE_URL: 'https://apisandbox.example.test',
  TAXATION_WHITEBOOKS_ACCOUNT_EMAIL: 'a@example.test',
  TAXATION_WHITEBOOKS_IP_ADDRESS: '203.0.113.7',
  TAXATION_WHITEBOOKS_EINVOICE_APP_ID: 'wb-id',
  TAXATION_WHITEBOOKS_EINVOICE_APP_SECRET: 'wb-secret',
  TAXATION_GSTIN_ALLOW_SANDBOX: 'true',
};
const config = (extra: Record<string, string> = {}) => loadConfig({ ...everything, ...extra });
const file = (router: GspRouter, creds: PortalCredentials | null) => router.submitInvoice(creds, { payload, existingIrns: [], now: NOW });

describe('GspRouter', () => {
  it('follows the deployment default for a company with no choice, whichever gateway that is', async () => {
    const onAdaequare = bothGateways();
    expect(await file(new GspRouter(config({ TAXATION_GSP_PROVIDER_CODE: 'ADAEQUARE_GSP' }), { transport: onAdaequare.transport }), base)).toMatchObject({ ok: true, irn: 'ADQ-IRN' });
    expect(onAdaequare.calls.map((c) => c.baseUrl)).toEqual(['https://gsp.example.test/']);

    const onWhitebooks = bothGateways();
    expect(await file(new GspRouter(config({ TAXATION_GSP_PROVIDER_CODE: 'WHITE_BOOKS_GSP' }), { transport: onWhitebooks.transport }), base)).toMatchObject({ ok: true, irn: 'WB-IRN' });
    expect(new Set(onWhitebooks.calls.map((c) => c.baseUrl))).toEqual(new Set(['https://apisandbox.example.test']));
  });

  it('files a company through the gateway chosen for it, whatever the default is', async () => {
    const t = bothGateways();
    const router = new GspRouter(config({ TAXATION_GSP_PROVIDER_CODE: 'ADAEQUARE_GSP' }), { transport: t.transport });

    expect(await file(router, { ...base, gspGateway: 'whitebooks' })).toMatchObject({ ok: true, irn: 'WB-IRN' });
    expect(new Set(t.calls.map((c) => c.baseUrl))).toEqual(new Set(['https://apisandbox.example.test']));
    // Whitebooks signs each call with its own application pair, not Adaequare's.
    expect(t.calls.at(-1)?.headers).toMatchObject({ client_id: 'wb-id', client_secret: 'wb-secret' });
  });

  it('serves both gateways at once, each with its own application and its own session', async () => {
    const t = bothGateways();
    const router = new GspRouter(config({ TAXATION_GSP_PROVIDER_CODE: 'WHITE_BOOKS_GSP' }), { transport: t.transport });

    const answers = await Promise.all([
      file(router, { ...base, gspGateway: 'adaequare' }),
      file(router, { ...base, gspGateway: 'whitebooks' }),
      file(router, base), // no choice: the default, Whitebooks
      file(router, { ...base, gspGateway: 'adaequare' }),
    ]);

    expect(answers.map((a) => (a.ok ? a.irn : a.errors[0].code))).toEqual(['ADQ-IRN', 'WB-IRN', 'WB-IRN', 'ADQ-IRN']);
    const hosts = (host: string) => t.calls.filter((c) => c.baseUrl === host);
    expect(hosts('https://gsp.example.test/').every((c) => c.path === '/enriched/ei/api/invoice')).toBe(true);
    expect(hosts('https://apisandbox.example.test').every((c) => c.path.startsWith('/einvoice/'))).toBe(true);
    // Adaequare exchanged its application credentials once for its two calls, on its own host.
    expect(t.authenticated).toEqual(['https://gsp.example.test/']);
  });

  it('refuses a company whose gateway this deployment cannot run, rather than filing it through the other', async () => {
    const t = bothGateways();
    // Live deployment: the sandbox switch is off, so Whitebooks is not available to anyone.
    const router = new GspRouter({ ...config({ TAXATION_GSP_PROVIDER_CODE: 'ADAEQUARE_GSP' }), TAXATION_GSTIN_ALLOW_SANDBOX: false }, { transport: t.transport });

    const answer = await file(router, { ...base, gspGateway: 'whitebooks' });

    expect(answer).toMatchObject({ ok: false, errors: [{ code: 'GSP_NOT_CONFIGURED' }] });
    if (!answer.ok) expect(answer.errors[0].message).toMatch(/sandbox only/);
    expect(t.calls).toHaveLength(0);
    // The default still works for everyone else.
    expect(await file(router, base)).toMatchObject({ ok: true, irn: 'ADQ-IRN' });
  });

  it('refuses a company whose gateway has no URL here', async () => {
    const t = bothGateways();
    const router = new GspRouter(config({ TAXATION_GSP_PROVIDER_CODE: 'ADAEQUARE_GSP', TAXATION_WHITEBOOKS_BASE_URL: '' }), { transport: t.transport });
    const answer = await file(router, { ...base, gspGateway: 'whitebooks' });
    expect(answer).toMatchObject({ ok: false, errors: [{ code: 'GSP_NOT_CONFIGURED' }] });
    expect(t.calls).toHaveLength(0);
  });

  it('reports a gateway it cannot run as a failed connection test, not an exception', async () => {
    const router = new GspRouter({ ...config(), TAXATION_GSTIN_ALLOW_SANDBOX: false }, { transport: bothGateways().transport });
    const result = await router.testConnection({ einvoice: { ...base, gspGateway: 'whitebooks' }, ewaybill: null });
    expect(result.irp.ok).toBe(false);
    expect(result.ewb.ok).toBe(false);
    expect(result.irp.message).toMatch(/sandbox only/);
  });

  it('says a gateway has no lookup, which recovery reads as the lookup being absent', async () => {
    const router = new GspRouter(config(), { transport: bothGateways().transport });
    const bill = await router.findEwayBillByDocument({ ...base, gspGateway: 'whitebooks' }, { docType: 'INV', docNo: '1', docDate: '2026-09-02', fromGstin: base.gstin, now: NOW });
    const irn = await router.getIrnStatus({ ...base, gspGateway: 'whitebooks' }, { irn: 'x', now: NOW });
    expect(isUnsupported(bill)).toBe(true);
    expect(isUnsupported(irn)).toBe(true);
  });

  it('refuses to start when the deployment cannot run its own default', () => {
    expect(() => new GspRouter({ ...config({ TAXATION_GSP_PROVIDER_CODE: 'WHITE_BOOKS_GSP' }), TAXATION_GSTIN_ALLOW_SANDBOX: false })).toThrow(/sandbox only/);
  });

  it('is one shared instance per config, so the features share each gateway’s session', () => {
    const c = config();
    expect(createGspRouter(c)).toBe(createGspRouter(c));
    expect(createGspRouter(c).gatewayFor('whitebooks')).toBe(createGspRouter(c).gatewayFor('whitebooks'));
    expect(createGspRouter(c).gatewayFor(undefined).gateway).toBe('adaequare');
  });

  it('looks the register up on the default gateway, which has no company to route by', () => {
    const router = new GspRouter(config({ TAXATION_GSP_PROVIDER_CODE: 'WHITE_BOOKS_GSP' }), { transport: bothGateways().transport });
    expect(router.gateway).toBe('whitebooks');
    expect(router.gatewayFor(undefined)).toBe(router.gatewayFor('whitebooks'));
  });
});

describe('parseGspGateway', () => {
  it('reads a stored choice, and treats anything else as no choice', () => {
    expect(parseGspGateway('adaequare')).toBe('adaequare');
    expect(parseGspGateway('whitebooks')).toBe('whitebooks');
    for (const none of [null, undefined, '', 'cleartax', 'ADAEQUARE_GSP', 'Whitebooks']) expect(parseGspGateway(none)).toBeUndefined();
  });
});

describe('gspAvailability', () => {
  const byName = (cfg: ReturnType<typeof config>) => Object.fromEntries(gspAvailability(cfg).map((o) => [o.gateway, o]));

  it('offers every gateway the deployment is set up for', () => {
    expect(byName(config())).toMatchObject({ adaequare: { available: true, sandboxOnly: false }, whitebooks: { available: true, sandboxOnly: true } });
  });

  it('withholds a sandbox-only gateway unless the sandbox switch is on', () => {
    const live = byName({ ...config(), TAXATION_GSTIN_ALLOW_SANDBOX: false });
    expect(live.whitebooks).toMatchObject({ available: false });
    expect(live.whitebooks.reason).toMatch(/sandbox/i);
    expect(live.adaequare.available).toBe(true);
  });

  it('withholds a gateway whose URL or application credentials are missing, and says which', () => {
    const noUrl = byName(config({ TAXATION_ADAEQUARE_BASE_URL: '' }));
    expect(noUrl.adaequare).toMatchObject({ available: false });
    expect(noUrl.adaequare.reason).toMatch(/TAXATION_ADAEQUARE_BASE_URL/);

    const noApp = byName(config({ TAXATION_WHITEBOOKS_EINVOICE_APP_ID: '', TAXATION_WHITEBOOKS_EINVOICE_APP_SECRET: '' }));
    expect(noApp.whitebooks).toMatchObject({ available: false });
    expect(noApp.whitebooks.reason).toMatch(/TAXATION_WHITEBOOKS_EINVOICE_APP/);
  });
});
