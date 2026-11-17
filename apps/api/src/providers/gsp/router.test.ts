import { describe, expect, it } from 'vitest';
import type { IrpInvoicePayload } from '@esmart/core/domain/eInvoice';
import { loadConfig } from '../../config';
import { isUnsupported, type PortalCredentials } from '../compliance';
import { createGspRouter, gspAvailability, GspRouter, parseGspGateway, parseGspTarget } from '.';
import type { GspEnvelope } from './envelope';
import { GspRequestError, type GspRequest, type GspTransport } from './transport';

const NOW = '2026-09-02T10:00:00.000Z';
const base: Omit<PortalCredentials, 'gspGateway' | 'gspEnvironment'> = { gstin: '29AAGCB1286Q000', username: 'api_user', password: 'hunter2' };

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
  // Adaequare's sandbox: its own host and its own application pair, beside the live ones above.
  TAXATION_ADAEQUARE_SANDBOX_BASE_URL: 'https://gsp.example.test/test/',
  TAXATION_ADAEQUARE_SANDBOX_APP_ID: 'adq-sbx-id',
  TAXATION_ADAEQUARE_SANDBOX_APP_SECRET: 'adq-sbx-secret',
};
/** Whitebooks production too, as it will be set once there is a subscription. */
const withWhitebooksProduction = {
  TAXATION_WHITEBOOKS_PRODUCTION_BASE_URL: 'https://api.example.test',
  TAXATION_WHITEBOOKS_PRODUCTION_EINVOICE_APP_ID: 'wb-live-id',
  TAXATION_WHITEBOOKS_PRODUCTION_EINVOICE_APP_SECRET: 'wb-live-secret',
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

  it('refuses a company whose target this deployment cannot run, rather than filing it through another', async () => {
    const t = bothGateways();
    // Whitebooks production has no settings here: there is nothing to run.
    const router = new GspRouter(config({ TAXATION_GSP_PROVIDER_CODE: 'ADAEQUARE_GSP' }), { transport: t.transport });

    const answer = await file(router, { ...base, gspGateway: 'whitebooks', gspEnvironment: 'production' });

    expect(answer).toMatchObject({ ok: false, errors: [{ code: 'GSP_NOT_CONFIGURED' }] });
    if (!answer.ok) expect(answer.errors[0].message).toMatch(/TAXATION_WHITEBOOKS_PRODUCTION_BASE_URL/);
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
    const router = new GspRouter(config(), { transport: bothGateways().transport });
    const result = await router.testConnection({ einvoice: { ...base, gspGateway: 'whitebooks', gspEnvironment: 'production' }, ewaybill: null });
    expect(result.irp.ok).toBe(false);
    expect(result.ewb.ok).toBe(false);
    expect(result.irp.message).toMatch(/TAXATION_WHITEBOOKS_PRODUCTION_BASE_URL/);
  });

  it('says a gateway has no lookup, which recovery reads as the lookup being absent', async () => {
    const router = new GspRouter(config(), { transport: bothGateways().transport });
    const bill = await router.findEwayBillByDocument({ ...base, gspGateway: 'whitebooks' }, { docType: 'INV', docNo: '1', docDate: '2026-09-02', fromGstin: base.gstin, now: NOW });
    const irn = await router.getIrnStatus({ ...base, gspGateway: 'whitebooks' }, { irn: 'x', now: NOW });
    expect(isUnsupported(bill)).toBe(true);
    expect(isUnsupported(irn)).toBe(true);
  });

  it('refuses to start when the deployment cannot run its own default', () => {
    expect(() => new GspRouter(config({ TAXATION_GSP_PROVIDER_CODE: 'WHITE_BOOKS_GSP', TAXATION_GSP_ENVIRONMENT: 'production' }))).toThrow(/TAXATION_WHITEBOOKS_PRODUCTION_BASE_URL/);
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
  const byTarget = (cfg: ReturnType<typeof config>) => Object.fromEntries(gspAvailability(cfg).map((o) => [`${o.gateway}:${o.environment}`, o]));

  it('lists all four targets, in the order an operator sees them', () => {
    expect(gspAvailability(config()).map((o) => `${o.gateway}:${o.environment}`)).toEqual(['adaequare:production', 'adaequare:sandbox', 'whitebooks:sandbox', 'whitebooks:production']);
  });

  it('offers every target the deployment is set up for, and lists the rest as unavailable', () => {
    const all = byTarget(config());
    expect(all['adaequare:production']).toMatchObject({ available: true });
    expect(all['adaequare:sandbox']).toMatchObject({ available: true });
    expect(all['whitebooks:sandbox']).toMatchObject({ available: true });
    // No subscription yet: it is there to be seen, and becomes choosable the moment its settings are filled in.
    expect(all['whitebooks:production']).toMatchObject({ available: false });
    expect(all['whitebooks:production'].reason).toMatch(/TAXATION_WHITEBOOKS_PRODUCTION_BASE_URL/);
    expect(byTarget(config(withWhitebooksProduction))['whitebooks:production']).toMatchObject({ available: true });
  });

  it('withholds a target whose URL or application credentials are missing, and says which', () => {
    const noUrl = byTarget(config({ TAXATION_ADAEQUARE_BASE_URL: '' }));
    expect(noUrl['adaequare:production']).toMatchObject({ available: false });
    expect(noUrl['adaequare:production'].reason).toMatch(/TAXATION_ADAEQUARE_PRODUCTION_BASE_URL/);
    // Its sandbox is a different product with its own settings, untouched.
    expect(noUrl['adaequare:sandbox'].available).toBe(true);

    const noApp = byTarget(config({ TAXATION_WHITEBOOKS_EINVOICE_APP_ID: '', TAXATION_WHITEBOOKS_EINVOICE_APP_SECRET: '' }));
    expect(noApp['whitebooks:sandbox']).toMatchObject({ available: false });
    expect(noApp['whitebooks:sandbox'].reason).toMatch(/TAXATION_WHITEBOOKS_SANDBOX_EINVOICE_APP/);
  });

  it('never lets a live pair stand in for a sandbox one, or the reverse', () => {
    // Only the older un-suffixed Adaequare settings are set: they mean production, so the sandbox has nothing.
    const legacyOnly = byTarget(loadConfig({ TAXATION_ADAEQUARE_BASE_URL: 'https://gsp.example.test/', TAXATION_ADAEQUARE_APP_ID: 'a', TAXATION_ADAEQUARE_APP_SECRET: 'b' }));
    expect(legacyOnly['adaequare:production'].available).toBe(true);
    expect(legacyOnly['adaequare:sandbox'].available).toBe(false);
    // And the older Whitebooks settings mean its sandbox.
    const wb = byTarget(loadConfig({ TAXATION_WHITEBOOKS_BASE_URL: 'https://x.test', TAXATION_WHITEBOOKS_EINVOICE_APP_ID: 'a', TAXATION_WHITEBOOKS_EINVOICE_APP_SECRET: 'b' }));
    expect(wb['whitebooks:sandbox'].available).toBe(true);
    expect(wb['whitebooks:production'].available).toBe(false);
  });
});

describe('sandbox and production are separate targets', () => {
  const sandboxLogin = { ...base, gspGateway: 'adaequare', gspEnvironment: 'sandbox' } as const;
  const liveLogin = { ...base, gspGateway: 'adaequare', gspEnvironment: 'production' } as const;

  it('sends Adaequare sandbox to its own host and application, and production to its own, in one process', async () => {
    const t = bothGateways();
    const router = new GspRouter(config({ TAXATION_GSP_PROVIDER_CODE: 'WHITE_BOOKS_GSP' }), { transport: t.transport });

    await file(router, sandboxLogin);
    await file(router, liveLogin);

    expect(t.calls.map((c) => c.baseUrl)).toEqual(['https://gsp.example.test/test/', 'https://gsp.example.test/']);
    // A token minted for one is never presented to the other: each target authenticated with its own pair.
    expect(t.authenticated).toEqual(['https://gsp.example.test/test/', 'https://gsp.example.test/']);
  });

  it('files a business as itself in production, and as the sandbox taxpayer in the sandbox', async () => {
    const t = bothGateways();
    const router = new GspRouter(config(), { transport: t.transport });

    await file(router, liveLogin);
    await file(router, sandboxLogin);

    const [live, sandbox] = t.calls;
    expect(live.headers).toMatchObject({ gstin: '29AAGCB1286Q000' });
    expect((live.body as typeof payload).DocDtls.No).toBe('INV-1');
    expect((live.body as typeof payload).BuyerDtls.Gstin).toBe('27AAGCB1286Q1Z4');
    // Sandbox: Adaequare's test taxpayer and test buyer, our own document number; the amounts are untouched.
    expect(sandbox.headers).toMatchObject({ gstin: '27AMBPG7773M016' });
    expect((sandbox.body as typeof payload).SellerDtls.Gstin).toBe('27AMBPG7773M016');
    expect((sandbox.body as typeof payload).BuyerDtls.Gstin).toBe('29AMBPG7773M000');
    expect((sandbox.body as typeof payload).DocDtls.No).not.toBe('INV-1');
    expect((sandbox.body as typeof payload).ValDtls.TotInvVal).toBe(118);
  });

  it('keeps the business’s own Adaequare sandbox login and swaps only the GSTIN', async () => {
    const t = bothGateways();
    const router = new GspRouter(config(), { transport: t.transport });
    await file(router, sandboxLogin);
    expect(t.calls[0].headers).toMatchObject({ user_name: 'api_user', password: 'hunter2', gstin: '27AMBPG7773M016' });
  });

  it('files in Whitebooks production exactly as the app built the document, with no sandbox stand-ins', async () => {
    const t = bothGateways();
    const router = new GspRouter(config(withWhitebooksProduction), { transport: t.transport });

    await file(router, { ...base, gspGateway: 'whitebooks', gspEnvironment: 'production' });
    await file(router, { ...base, gspGateway: 'whitebooks', gspEnvironment: 'sandbox' });

    const live = t.calls.filter((c) => c.baseUrl === 'https://api.example.test');
    const sandbox = t.calls.filter((c) => c.baseUrl === 'https://apisandbox.example.test');
    // Its own application pair per environment.
    expect(live.at(-1)?.headers).toMatchObject({ client_id: 'wb-live-id', client_secret: 'wb-live-secret' });
    expect(sandbox.at(-1)?.headers).toMatchObject({ client_id: 'wb-id', client_secret: 'wb-secret' });
    const generated = (calls: typeof t.calls) => calls.find((c) => c.path === '/einvoice/type/GENERATE/version/V1_03')!;
    expect((generated(live).body as typeof payload).DocDtls.No).toBe('INV-1');
    expect(generated(live).headers).toMatchObject({ gstin: '29AAGCB1286Q000' });
    expect((generated(sandbox).body as typeof payload).DocDtls.No).not.toBe('INV-1');
  });

  it('reads an old login stamped with only a gateway as that gateway’s usual environment', () => {
    const router = new GspRouter(config(), { transport: bothGateways().transport });
    expect(router.targetOf({ gspGateway: 'whitebooks' })).toEqual({ gateway: 'whitebooks', environment: 'sandbox' });
    expect(router.targetOf({ gspGateway: 'adaequare' })).toEqual({ gateway: 'adaequare', environment: 'production' });
    expect(router.targetOf({})).toEqual(router.target);
  });
});

describe('parseGspTarget', () => {
  it('reads a stored choice, and treats anything else as no choice', () => {
    expect(parseGspTarget('adaequare', 'sandbox')).toEqual({ gateway: 'adaequare', environment: 'sandbox' });
    expect(parseGspTarget('whitebooks', 'production')).toEqual({ gateway: 'whitebooks', environment: 'production' });
    expect(parseGspTarget(null, null)).toBeUndefined();
    expect(parseGspTarget('cleartax', 'sandbox')).toBeUndefined();
  });

  it('takes a gateway with no environment as it was before environments existed', () => {
    expect(parseGspTarget('whitebooks', null)).toEqual({ gateway: 'whitebooks', environment: 'sandbox' });
    expect(parseGspTarget('adaequare', 'bogus')).toEqual({ gateway: 'adaequare', environment: 'production' });
  });
});
