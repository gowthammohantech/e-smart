import { randomUUID } from 'node:crypto';
import { E_INVOICE_CANCEL_REASONS } from '@esmart/core/domain/eInvoice';
import { EWAY_CANCEL_REASONS } from '@esmart/core/domain/ewayBill';
import type { Config } from '../../config';
import { gspBaseUrl } from '../../config';
import type {
  CancelEwayBillResult,
  CancelIrnResult,
  ComplianceProvider,
  ConnectionResult,
  ExtendResult,
  FindEwayBillResult,
  IrnStatusResult,
  PortalCredentials,
  PortalLogins,
  SubmitEwayBillResult,
  SubmitInvoiceResult,
  UpdatePartBResult,
} from '../compliance';
import {
  acknowledgement,
  baseUrlOf,
  cancelEwayBillBody,
  ewayBillByIrnBody,
  ewayBillResult,
  extendBody,
  failureFrom,
  incomplete,
  nativeEwayBillBody,
  partBBody,
  prepareIrnPayload,
  requireLogin,
  type EwbRecord,
  type GspGateway,
  type IrnRecord,
} from './common';
import { GSP_TOKEN_EXPIRY_SKEW_MS, NIC_ERROR_CODES } from './constants';
import { carriesField, hasErrorCode, parsePortalDateAny, toPortalDateTime, unwrapResult } from './envelope';
import { defaultGspTarget, gspApplication, type GspTarget } from './provider-name';
import {
  ADAEQUARE_SANDBOX_BUYER,
  ADAEQUARE_SANDBOX_EWB_GSTIN,
  ADAEQUARE_SANDBOX_GSTIN,
  DISTANCE_REFUSED,
  IRN_HSN_REFUSED,
  SANDBOX_ACCEPTED_HSN,
  STANDALONE_DISTANCE_REFUSED,
  STANDALONE_HSN_REFUSED,
  adaequareSandboxEwbSeller,
  adaequareSandboxSeller,
  ewayFrom,
  irpHsnSwap,
  resplitIrnTax,
  resplitTax,
  sandboxDocNo,
  sandboxRates,
} from './sandbox';
import { FetchGspTransport, GspAuthError, GspConfigError, GspRequestError, type GspTransport } from './transport';

/**
 * Adaequare's routes, joined onto `TAXATION_GSP_BASE_URL`.
 *
 * `/enriched/` is Adaequare's own namespace: the wrapper that does NIC's payload
 * encryption for us, which is why bodies here are plain JSON rather than
 * `Data: Encrypt(Base64(json), sek)`.
 *
 * **Provenance matters.** Generate, lookup and by-document are documented. The
 * cancel routes are inferred from NIC's schema and a third-party integration,
 * and the standalone e-way bill routes (generate directly, Part B, extend) are
 * by analogy with NIC's own `ewayapi?action=` — a mock serves whatever route it
 * is given, so only a run against Adaequare's sandbox settles them.
 */
const PATHS = {
  taxpayerSearch: '/enriched/commonapi/search',
  generateIrn: '/enriched/ei/api/invoice',
  irnByDocDetails: '/enriched/ei/api/invoice/irnbydocdetails',
  cancelIrn: '/enriched/ei/api/invoice/cancel',
  generateEwayBillByIrn: '/enriched/ei/api/ewaybill',
  cancelEwayBill: '/enriched/ei/api/ewayapi',
  standaloneEwayBill: '/enriched/ewb/ewayapi',
  // Recovery lookups, by analogy with NIC's `GetEwayBillGeneratedByConsigner` and `GetIRN`: unconfirmed
  // until a run against Adaequare's sandbox, like the standalone routes above.
  ewayBillByDocument: '/enriched/ewb/ewayapi/GetEwayBillGeneratedByConsigner',
  irnDetails: '/enriched/ei/api/invoice/irn',
} as const;

/**
 * The sandbox refusing the distance it was given. Adaequare's e-way bill API sends this as bare text ("The distance between
 * the pincodes given is too high") with no NIC code, so the wording is read as well as the codes.
 */
const distanceRefused = (error: unknown): boolean =>
  error instanceof GspRequestError &&
  (DISTANCE_REFUSED.some((code) => hasErrorCode(error.envelope, code)) || hasErrorCode(error.envelope, STANDALONE_DISTANCE_REFUSED) || /distance between the pincodes/i.test(error.message));

type CancelRecord = { CancelDate?: string; cancelDate?: string };

type Bearer = { value: string; expiresAt: number };

/**
 * E-invoice, e-way bill and taxpayer lookup through Adaequare, for one environment: its production API or its
 * sandbox (`config` is already read for that target, see `configFor`).
 *
 * Production files a business as itself. The sandbox has one registered taxpayer and a short list of buyers, so
 * against it every business is filed as that test taxpayer (and, if configured, its test login), buyers are
 * swapped for a registered one, tax is re-split to match, HSN codes the sandbox does not know are retried under one
 * it does, and document numbers are our own. The app's own invoice, PDF and audit trail keep the real data. These
 * stand-ins follow Adaequare's published sandbox collection; run them against the sandbox before relying on them.
 *
 * Two credentials ride every filing call and conflating them is the classic
 * mistake: the bearer proves the *application* may use the pipe (one pair for
 * everything, from the environment), and the `user_name` / `password` / `gstin`
 * headers say which *taxpayer* the document is filed against (per company).
 *
 * The bearer belongs to the application, not a user, and GSPs rate-limit the
 * authenticate route far harder than the data routes, so it is cached until a
 * minute before it expires and a burst awaits one in-flight exchange.
 */
export class AdaequareGateway implements GspGateway {
  readonly name = 'gsp' as const;
  readonly gateway = 'adaequare' as const;

  private bearer: (Bearer & { clientId: string }) | null = null;
  private inFlight: Promise<Bearer> | null = null;
  /** Which target this client files against. */
  private readonly target: GspTarget;
  /** True against Adaequare's sandbox, where the stand-ins apply. */
  private readonly sandbox: boolean;

  constructor(
    private readonly config: Config,
    private readonly transport: GspTransport = new FetchGspTransport(),
    private readonly clock: () => number = Date.now,
    private readonly log: (message: string) => void = () => {},
  ) {
    this.target = defaultGspTarget(config);
    this.sandbox = this.target.environment === 'sandbox';
  }

  // ----------------------------------------------------------------- session

  private application(_creds: PortalCredentials | null) {
    const env = gspApplication(this.config, this.target, 'EINVOICE');
    // The application pair is ours, from the environment; the business never supplies it.
    if (!env.clientId || !env.clientSecret) throw new GspConfigError(`${env.variable} must be set for the Adaequare ${this.target.environment} gateway.`);
    return { clientId: env.clientId, clientSecret: env.clientSecret };
  }

  private baseUrl() {
    return baseUrlOf(gspBaseUrl(this.config));
  }

  /** The bearer, or '' when `TAXATION_GSP_AUTH_REQUIRED=false` (a stand-in gateway that mints nothing). */
  private async token(app: { clientId: string; clientSecret: string }): Promise<string> {
    if (!this.config.TAXATION_GSP_AUTH_REQUIRED) return '';
    const cached = this.bearer;
    if (cached && cached.clientId === app.clientId && cached.expiresAt - GSP_TOKEN_EXPIRY_SKEW_MS > this.clock()) return cached.value;
    this.inFlight ??= this.mint(app).finally(() => {
      this.inFlight = null;
    });
    return (await this.inFlight).value;
  }

  private async mint(app: { clientId: string; clientSecret: string }): Promise<Bearer> {
    try {
      const minted = await this.transport.authenticate({ baseUrl: this.baseUrl(), clientId: app.clientId, clientSecret: app.clientSecret });
      const bearer = { value: minted.accessToken, expiresAt: this.clock() + minted.expiresInSeconds * 1000 };
      this.bearer = { ...bearer, clientId: app.clientId };
      return bearer;
    } catch (error) {
      if (error instanceof GspRequestError && !error.isUnavailable) {
        // The gateway's wording can name the account: logged, never surfaced.
        this.log(`Adaequare authentication failed: ${error.message}`);
        throw new GspAuthError();
      }
      throw error;
    }
  }

  /**
   * The login a filing is made with. Production: the business's own. Sandbox: the business's own username and password,
   * as typed, with only the GSTIN swapped for the sandbox's test taxpayer (the sandbox knows no real GSTIN). A wrong or
   * missing login is refused, as it is everywhere. Adaequare's sandbox has TWO test taxpayers, one per API family: the
   * e-invoice API (`ei`: IRN, e-way bill by IRN, cancel) files as `TAXATION_ADAEQUARE_SANDBOX_GSTIN` (27AMBPG7773M016
   * unless set), the standalone e-way bill API (`ewb`: generate without an IRN, Part B, extension) as
   * `TAXATION_ADAEQUARE_SANDBOX_EWB_GSTIN` (05AAACG2115R1ZN unless set). Every sandbox e-way bill is on the second one.
   */
  private login(creds: PortalCredentials | null, api: 'ei' | 'ewb'): PortalCredentials {
    const own = requireLogin(creds);
    if (!this.sandbox) return own;
    const c = this.config;
    const gstin = api === 'ewb' ? c.TAXATION_ADAEQUARE_SANDBOX_EWB_GSTIN || ADAEQUARE_SANDBOX_EWB_GSTIN : c.TAXATION_ADAEQUARE_SANDBOX_GSTIN || ADAEQUARE_SANDBOX_GSTIN;
    if (own.gstin !== gstin) this.log(`Filing as Adaequare sandbox taxpayer ${gstin} in place of ${own.gstin || 'no GSTIN'}`);
    return { ...own, gstin };
  }

  /**
   * The NIC portal headers that ride beside the bearer. `requestid` is fresh on every call, recovery lookups included.
   * The e-invoice routes (`/enriched/ei/…`) name the user `user_name`; the e-way bill routes (`/enriched/ewb/…`) `username`.
   */
  private portalHeaders(creds: PortalCredentials, path: string): Record<string, string> {
    const user: Record<string, string> = path.startsWith('/enriched/ewb') ? { username: creds.username } : { user_name: creds.username };
    return { ...user, password: creds.password, gstin: creds.gstin, requestid: randomUUID() };
  }

  private async call<T>(
    method: 'get' | 'post',
    creds: PortalCredentials,
    path: string,
    opts: { body?: unknown; query?: Record<string, string> } = {},
  ) {
    const app = this.application(creds);
    const token = await this.token(app);
    return this.transport[method]<T>({ baseUrl: this.baseUrl(), path, token, headers: this.portalHeaders(creds, path), ...opts });
  }

  private async guard<T extends { ok: boolean }>(run: () => Promise<T>) {
    try {
      return await run();
    } catch (error) {
      return failureFrom(error, this.log);
    }
  }

  // ------------------------------------------------------------ ComplianceProvider

  async testConnection(logins: PortalLogins): Promise<ConnectionResult> {
    const check = async (login: PortalCredentials | null, portal: string) => {
      if (!login) return { ok: false, message: `No ${portal} credentials are stored yet` };
      try {
        if (this.config.TAXATION_GSP_AUTH_REQUIRED) await this.token(this.application(login));
        // Adaequare has no standalone login route: the portal login is only checked when a document is filed.
        return {
          ok: true,
          message: this.config.TAXATION_GSP_AUTH_REQUIRED
            ? `The GST gateway accepted this application. The ${portal} login is verified when the first document is filed.`
            : 'Gateway authentication is switched off (TAXATION_GSP_AUTH_REQUIRED=false).',
        };
      } catch (error) {
        return { ok: false, message: failureFrom(error, this.log).errors[0]?.message ?? 'Failed' };
      }
    };
    return { irp: await check(logins.einvoice, 'e-invoice'), ewb: await check(logins.ewaybill, 'e-way bill') };
  }

  submitInvoice(creds: PortalCredentials | null, req: Parameters<ComplianceProvider['submitInvoice']>[1]): Promise<SubmitInvoiceResult> {
    return this.guard(async () => {
      const login = this.login(creds, 'ei');
      const payload = this.sandbox ? this.sandboxInvoice(login, req) : req.payload;
      const file = async (body: Record<string, unknown>) => {
        try {
          return await this.call<IrnRecord>('post', login, PATHS.generateIrn, { body });
        } catch (error) {
          // The sandbox's HSN master is short: retry once under a code it knows. The app's own invoice keeps the real one.
          const items = (body.ItemList as { HsnCd?: string; IsServc?: string }[]) ?? [];
          if (!(this.sandbox && error instanceof GspRequestError && IRN_HSN_REFUSED.some((code) => hasErrorCode(error.envelope, code)) && items.some((i) => irpHsnSwap(i).HsnCd !== i.HsnCd))) throw error;
          this.log(`The sandbox does not know an HSN on this invoice: filing it under ${SANDBOX_ACCEPTED_HSN}`);
          return this.call<IrnRecord>('post', login, PATHS.generateIrn, { body: { ...body, ItemList: items.map(irpHsnSwap) } });
        }
      };
      try {
        const envelope = await file(prepareIrnPayload(payload) as unknown as Record<string, unknown>);
        // `unwrapResult`, not `envelope.result`: Adaequare wraps the record, a stand-in answers with it bare.
        const record = unwrapResult(envelope);
        if (!record?.Irn) return incomplete('IRN');
        return acknowledgement(record, req.now);
      } catch (error) {
        // NIC 2150 means the document *is* registered and we merely lack the acknowledgement — exactly the
        // state a request that timed out mid-flight leaves behind. Fetch it and adopt it.
        const maybeRegistered = error instanceof GspRequestError && (hasErrorCode(error.envelope, NIC_ERROR_CODES.DUPLICATE_IRN) || error.source === 'transport');
        if (maybeRegistered) {
          const found = await this.irnByDocument(login, payload.DocDtls).catch(() => null);
          if (found?.Irn) return acknowledgement(found, req.now);
        }
        throw error;
      }
    });
  }

  /**
   * **Sandbox only.** The invoice as the sandbox can take it: filed by its one test taxpayer (whose registration is the
   * seller block NIC checks against the session's GSTIN), to a buyer it has registered (3028 otherwise), with the
   * tax re-split to match those two states (NIC 2172) and a document number of our own, so a retry finds our
   * registration and not a stranger's (see `sandboxDocNo`). Place of supply and the amounts are the document's.
   */
  private sandboxInvoice(login: PortalCredentials, req: Parameters<ComplianceProvider['submitInvoice']>[1]): typeof req.payload {
    const p = req.payload;
    const buyer = p.BuyerDtls.Gstin && p.BuyerDtls.Gstin !== 'URP' ? { ...ADAEQUARE_SANDBOX_BUYER, Pos: p.BuyerDtls.Pos } : p.BuyerDtls;
    return resplitIrnTax({
      ...p,
      SellerDtls: adaequareSandboxSeller(login.gstin) as unknown as typeof p.SellerDtls,
      BuyerDtls: buyer as unknown as typeof p.BuyerDtls,
      DocDtls: { ...p.DocDtls, No: sandboxDocNo(this.config, login.gstin, p.DocDtls.No, p.DocDtls.Dt, req.companyId) },
    });
  }

  /** An identity lookup: type, number and date bind together. A broken recovery must never mask the original error. */
  private async irnByDocument(creds: PortalCredentials, doc: { Typ: string; No: string; Dt: string }): Promise<IrnRecord | null> {
    const envelope = await this.call<IrnRecord>('get', creds, PATHS.irnByDocDetails, { query: { doctype: doc.Typ, docnum: doc.No, docdate: doc.Dt } });
    return unwrapResult(envelope);
  }

  cancelIrn(creds: PortalCredentials | null, req: Parameters<ComplianceProvider['cancelIrn']>[1]): Promise<CancelIrnResult> {
    return this.guard(async () => {
      const login = this.login(creds, 'ei');
      const envelope = await this.call<CancelRecord>('post', login, PATHS.cancelIrn, {
        // A string, per NIC's `String(1)`.
        body: { Irn: req.irn, CnlRsn: req.reasonCode, ...(req.remark?.trim() ? { CnlRem: req.remark.trim() } : {}) },
      });
      const record = unwrapResult(envelope);
      // A cancellation counts only if the portal acknowledged one: a false success cannot be walked back.
      if (!carriesField(record, 'CancelDate', 'cancelDate')) return incomplete('cancellation date');
      const cancelled = parsePortalDateAny(record?.CancelDate ?? record?.cancelDate) ?? new Date(req.now);
      return { ok: true as const, cancelDate: toPortalDateTime(cancelled), reason: E_INVOICE_CANCEL_REASONS[req.reasonCode] };
    });
  }

  submitEwayBill(creds: PortalCredentials | null, req: Parameters<ComplianceProvider['submitEwayBill']>[1]): Promise<SubmitEwayBillResult> {
    return this.guard(async () => {
      // Production: by IRN it is the e-invoice API and its taxpayer; with none it is the standalone e-way bill API and its own.
      const ewbLogin = this.login(creds, 'ewb');
      // With a live IRN the bill is raised against it (Part B only); NIC already holds the document.
      const byIrn = (payload: typeof req.payload) => this.call<EwbRecord>('post', this.login(creds, 'ei'), PATHS.generateEwayBillByIrn, { body: ewayBillByIrnBody(req.irn!, payload, 'TrnDocNO', 'TrnDocDt') });
      // The sandbox is shown valid GST rates on the summary line: the blend of a mixed-rate invoice (about 16.3%) is refused.
      const direct = (payload: typeof req.payload) => this.call<EwbRecord>('post', ewbLogin, PATHS.standaloneEwayBill, { query: { action: 'GENEWAYBILL' }, body: this.sandbox ? sandboxRates(nativeEwayBillBody(payload)) : nativeEwayBillBody(payload) });
      let envelope;
      if (req.irn && !this.sandbox) {
        envelope = await byIrn(req.payload);
      } else if (!this.sandbox) {
        envelope = await direct(req.payload);
      } else {
        // Sandbox: every bill is raised through the standalone e-way bill API, IRN or not. A bill raised against an IRN
        // lives only in the e-invoice system and can never be cancelled there: its cancel route answers GSPERR300 for
        // every bill and reason, and the e-way bill API cannot see it. So the whole lifecycle (Part B, extension, cancel)
        // would be untestable. The standalone API checks the whole bill itself and knows only its own register: the
        // e-way bill sandbox taxpayer stands in as the consignor, a registered consignee is shown as unregistered (URP, as
        // in Adaequare's own sample, since the sandbox refuses a GSTIN it has not registered), the tax is re-split to match
        // the states, and our own document number is shown.
        const payload = {
          ...req.payload,
          ...ewayFrom(adaequareSandboxEwbSeller(ewbLogin.gstin)),
          toGstin: 'URP',
          // The sandbox register does not know a real transporter's GSTIN ("Invalid Transporter Id"): the vehicle number alone moves the goods.
          transporterId: '',
          docNo: sandboxDocNo(this.config, ewbLogin.gstin, req.payload.docNo, req.payload.docDate, req.companyId),
        };
        Object.assign(payload, resplitTax(payload));
        const generate = async (p: typeof payload): Promise<Awaited<ReturnType<typeof direct>>> => {
          try {
            return await direct(p);
          } catch (error) {
            if (!(error instanceof GspRequestError && hasErrorCode(error.envelope, STANDALONE_HSN_REFUSED) && p.mainHsnCode !== SANDBOX_ACCEPTED_HSN)) throw error;
            this.log(`The sandbox does not know HSN ${p.mainHsnCode}: filing under ${SANDBOX_ACCEPTED_HSN}`);
            return direct({ ...p, mainHsnCode: SANDBOX_ACCEPTED_HSN });
          }
        };
        try {
          envelope = await generate(payload);
        } catch (error) {
          if (!distanceRefused(error)) throw error;
          envelope = await generate({ ...payload, transDistance: 0 });
        }
      }
      return ewayBillResult(unwrapResult(envelope), req) ?? incomplete('e-way bill number');
    });
  }

  updatePartB(creds: PortalCredentials | null, req: Parameters<ComplianceProvider['updatePartB']>[1]): Promise<UpdatePartBResult> {
    return this.guard(async () => {
      const login = this.login(creds, 'ewb');
      const envelope = await this.call<{ vehUpdDate?: string }>('post', login, PATHS.standaloneEwayBill, { query: { action: 'VEHEWB' }, body: partBBody(req) });
      const record = unwrapResult(envelope);
      return { ok: true as const, updatedAt: (parsePortalDateAny(record?.vehUpdDate) ?? new Date(req.now)).toISOString() };
    });
  }

  extend(creds: PortalCredentials | null, req: Parameters<ComplianceProvider['extend']>[1]): Promise<ExtendResult> {
    return this.guard(async () => {
      const login = this.login(creds, 'ewb');
      const envelope = await this.call<{ validUpto?: string }>('post', login, PATHS.standaloneEwayBill, { query: { action: 'EXTENDVALIDITY' }, body: extendBody(req) });
      const validUpto = parsePortalDateAny(unwrapResult(envelope)?.validUpto);
      return validUpto ? { ok: true as const, newValidUpto: validUpto.toISOString() } : incomplete('new validity');
    });
  }

  cancelEwayBill(creds: PortalCredentials | null, req: Parameters<ComplianceProvider['cancelEwayBill']>[1]): Promise<CancelEwayBillResult> {
    return this.guard(async () => {
      if (!Number.isSafeInteger(Number(req.ewayBillNumber))) return incomplete(`usable e-way bill number (got "${req.ewayBillNumber}")`);
      const body = cancelEwayBillBody(req.ewayBillNumber, req.reasonCode, req.remark?.trim());
      // Sandbox: every bill was raised through the standalone e-way bill API (see submitEwayBill), so it is cancelled there,
      // as the taxpayer that raised it. Production: the e-invoice API, which holds the bills raised against an IRN.
      const envelope = this.sandbox
        ? await this.call<CancelRecord>('post', this.login(creds, 'ewb'), PATHS.standaloneEwayBill, { query: { action: 'CANEWB' }, body })
        : await this.call<CancelRecord>('post', this.login(creds, 'ei'), PATHS.cancelEwayBill, { body });
      const record = unwrapResult(envelope);
      // The stake is higher than on the IRN side: a bill wrongly recorded as cancelled is one the portal
      // still considers live, against goods on the road.
      if (!carriesField(record, 'cancelDate', 'CancelDate')) return incomplete('cancellation date');
      const cancelled = parsePortalDateAny(record?.cancelDate ?? record?.CancelDate) ?? new Date(req.now);
      return { ok: true as const, cancelledAt: cancelled.toISOString(), reason: EWAY_CANCEL_REASONS[req.reasonCode] };
    });
  }

  /** The bill the portal raised for a document, after a generate whose answer was lost. NIC answers 604 when there is none. */
  findEwayBillByDocument(creds: PortalCredentials | null, req: Parameters<NonNullable<ComplianceProvider['findEwayBillByDocument']>>[1]): Promise<FindEwayBillResult> {
    return this.guard(async () => {
      const login = this.login(creds, 'ewb');
      try {
        const envelope = await this.call<EwbRecord>('get', login, PATHS.ewayBillByDocument, { query: { docType: req.docType, docNo: req.docNo } });
        return { ok: true as const, found: ewayBillResult(unwrapResult(envelope), { now: req.now }) };
      } catch (error) {
        if (error instanceof GspRequestError && hasErrorCode(error.envelope, '604')) return { ok: true as const, found: null };
        throw error;
      }
    });
  }

  /** Whether an IRN is still active, after a cancel whose answer was lost. `Status` is ACT or CNL. */
  getIrnStatus(creds: PortalCredentials | null, req: Parameters<NonNullable<ComplianceProvider['getIrnStatus']>>[1]): Promise<IrnStatusResult> {
    return this.guard(async () => {
      const login = this.login(creds, 'ei');
      const envelope = await this.call<{ Status?: string; status?: string; CancelDate?: string; cancelDate?: string }>('get', login, PATHS.irnDetails, { query: { irn: req.irn } });
      const record = unwrapResult(envelope);
      const status = String(record?.Status ?? record?.status ?? '').toUpperCase();
      if (status !== 'ACT' && status !== 'CNL') return incomplete('IRN status');
      const cancelled = parsePortalDateAny(record?.CancelDate ?? record?.cancelDate);
      return status === 'CNL' ? { ok: true as const, status: 'cancelled' as const, cancelDate: toPortalDateTime(cancelled ?? new Date(req.now)) } : { ok: true as const, status: 'active' as const };
    });
  }

  // -------------------------------------------------------------- taxpayer lookup

  /**
   * `GET /enriched/commonapi/search?action=TP&gstin=…` with the bearer only: a
   * search asks a public register a question and files nothing, so the NIC
   * account does not come into it. "No such registration" arrives two ways — a
   * gateway 404, and `SWEB_9035` on a 200 carrying `success: false`.
   */
  async lookupTaxpayer(gstin: string): Promise<Record<string, unknown> | null> {
    const app = this.application(null);
    const token = await this.token(app);
    try {
      const envelope = await this.transport.get<Record<string, unknown>>({
        baseUrl: this.baseUrl(),
        path: PATHS.taxpayerSearch,
        token,
        query: { action: 'TP', gstin },
      });
      const record = unwrapResult(envelope);
      // `{}` from a misconfigured mock is not a registration, and an array is a gateway doing something unexpected.
      return record && typeof record === 'object' && !Array.isArray(record) && Object.keys(record).length > 0 ? record : null;
    } catch (error) {
      if (error instanceof GspRequestError && !error.isUnavailable && (error.status === 404 || hasErrorCode(error.envelope, NIC_ERROR_CODES.INVALID_GSTIN))) return null;
      throw error;
    }
  }
}
