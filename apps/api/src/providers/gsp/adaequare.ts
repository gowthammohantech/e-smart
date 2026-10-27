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
import { gspApplication } from './provider-name';
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
} as const;

type CancelRecord = { CancelDate?: string; cancelDate?: string };

type Bearer = { value: string; expiresAt: number };

/**
 * E-invoice, e-way bill and taxpayer lookup through Adaequare.
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

  constructor(
    private readonly config: Config,
    private readonly transport: GspTransport = new FetchGspTransport(),
    private readonly clock: () => number = Date.now,
    private readonly log: (message: string) => void = () => {},
  ) {}

  // ----------------------------------------------------------------- session

  private application(_creds: PortalCredentials | null) {
    const env = gspApplication(this.config, 'adaequare', 'EINVOICE');
    // The application pair is ours, from the environment; the business never supplies it.
    if (!env.clientId || !env.clientSecret) throw new GspConfigError(`${env.variable} must be set for the Adaequare gateway.`);
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

  /** The NIC portal headers that ride beside the bearer. `requestid` is fresh on every call, recovery lookups included. */
  private portalHeaders(creds: PortalCredentials): Record<string, string> {
    return { user_name: creds.username, password: creds.password, gstin: creds.gstin, requestid: randomUUID() };
  }

  private async call<T>(
    method: 'get' | 'post',
    creds: PortalCredentials,
    path: string,
    opts: { body?: unknown; query?: Record<string, string> } = {},
  ) {
    const app = this.application(creds);
    const token = await this.token(app);
    return this.transport[method]<T>({ baseUrl: this.baseUrl(), path, token, headers: this.portalHeaders(creds), ...opts });
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
      const login = requireLogin(creds);
      try {
        const envelope = await this.call<IrnRecord>('post', login, PATHS.generateIrn, { body: prepareIrnPayload(req.payload) });
        // `unwrapResult`, not `envelope.result`: Adaequare wraps the record, a stand-in answers with it bare.
        const record = unwrapResult(envelope);
        if (!record?.Irn) return incomplete('IRN');
        return acknowledgement(record, req.now);
      } catch (error) {
        // NIC 2150 means the document *is* registered and we merely lack the acknowledgement — exactly the
        // state a request that timed out mid-flight leaves behind. Fetch it and adopt it.
        const maybeRegistered = error instanceof GspRequestError && (hasErrorCode(error.envelope, NIC_ERROR_CODES.DUPLICATE_IRN) || error.source === 'transport');
        if (maybeRegistered) {
          const found = await this.irnByDocument(login, req.payload.DocDtls).catch(() => null);
          if (found?.Irn) return acknowledgement(found, req.now);
        }
        throw error;
      }
    });
  }

  /** An identity lookup: type, number and date bind together. A broken recovery must never mask the original error. */
  private async irnByDocument(creds: PortalCredentials, doc: { Typ: string; No: string; Dt: string }): Promise<IrnRecord | null> {
    const envelope = await this.call<IrnRecord>('get', creds, PATHS.irnByDocDetails, { query: { doctype: doc.Typ, docnum: doc.No, docdate: doc.Dt } });
    return unwrapResult(envelope);
  }

  cancelIrn(creds: PortalCredentials | null, req: Parameters<ComplianceProvider['cancelIrn']>[1]): Promise<CancelIrnResult> {
    return this.guard(async () => {
      const login = requireLogin(creds);
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
      const login = requireLogin(creds);
      // With a live IRN the bill is raised against it (Part B only); NIC already holds the document.
      const envelope = req.irn
        ? await this.call<EwbRecord>('post', login, PATHS.generateEwayBillByIrn, { body: ewayBillByIrnBody(req.irn, req.payload, 'TrnDocNO', 'TrnDocDt') })
        : await this.call<EwbRecord>('post', login, PATHS.standaloneEwayBill, { query: { action: 'GENEWAYBILL' }, body: nativeEwayBillBody(req.payload) });
      return ewayBillResult(unwrapResult(envelope), req) ?? incomplete('e-way bill number');
    });
  }

  updatePartB(creds: PortalCredentials | null, req: Parameters<ComplianceProvider['updatePartB']>[1]): Promise<UpdatePartBResult> {
    return this.guard(async () => {
      const login = requireLogin(creds);
      const envelope = await this.call<{ vehUpdDate?: string }>('post', login, PATHS.standaloneEwayBill, { query: { action: 'VEHEWB' }, body: partBBody(req) });
      const record = unwrapResult(envelope);
      return { ok: true as const, updatedAt: (parsePortalDateAny(record?.vehUpdDate) ?? new Date(req.now)).toISOString() };
    });
  }

  extend(creds: PortalCredentials | null, req: Parameters<ComplianceProvider['extend']>[1]): Promise<ExtendResult> {
    return this.guard(async () => {
      const login = requireLogin(creds);
      const envelope = await this.call<{ validUpto?: string }>('post', login, PATHS.standaloneEwayBill, { query: { action: 'EXTENDVALIDITY' }, body: extendBody(req) });
      const validUpto = parsePortalDateAny(unwrapResult(envelope)?.validUpto);
      return validUpto ? { ok: true as const, newValidUpto: validUpto.toISOString() } : incomplete('new validity');
    });
  }

  cancelEwayBill(creds: PortalCredentials | null, req: Parameters<ComplianceProvider['cancelEwayBill']>[1]): Promise<CancelEwayBillResult> {
    return this.guard(async () => {
      const login = requireLogin(creds);
      if (!Number.isSafeInteger(Number(req.ewayBillNumber))) return incomplete(`usable e-way bill number (got "${req.ewayBillNumber}")`);
      const envelope = await this.call<CancelRecord>('post', login, PATHS.cancelEwayBill, { body: cancelEwayBillBody(req.ewayBillNumber, req.reasonCode, req.remark?.trim()) });
      const record = unwrapResult(envelope);
      // The stake is higher than on the IRN side: a bill wrongly recorded as cancelled is one the portal
      // still considers live, against goods on the road.
      if (!carriesField(record, 'cancelDate', 'CancelDate')) return incomplete('cancellation date');
      const cancelled = parsePortalDateAny(record?.cancelDate ?? record?.CancelDate) ?? new Date(req.now);
      return { ok: true as const, cancelledAt: cancelled.toISOString(), reason: EWAY_CANCEL_REASONS[req.reasonCode] };
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
