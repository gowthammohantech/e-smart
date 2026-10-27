import { E_INVOICE_CANCEL_REASONS } from '@esmart/core/domain/eInvoice';
import { EWAY_CANCEL_REASONS } from '@esmart/core/domain/ewayBill';
import type { Config } from '../../config';
import { gspBaseUrl, whitebooksSettings } from '../../config';
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
  whitebooksAccount,
  type EwbRecord,
  type GspGateway,
  type IrnRecord,
} from './common';
import { GSP_TOKEN_EXPIRY_SKEW_MS, GSP_TOKEN_FALLBACK_TTL_SECONDS, NIC_ERROR_CODES } from './constants';
import { asCode, carriesField, hasErrorCode, parsePortalDateAny, parsePortalDateTime, toPortalDateTime, type GspEnvelope } from './envelope';
import { gspApplication, type GspProduct } from './provider-name';
import { FetchGspTransport, GspAuthError, GspConfigError, GspRequestError, type GspTransport } from './transport';

/**
 * Whitebooks' routes, relative to `TAXATION_GSP_BASE_URL`. Authenticate, generate,
 * cancel and e-way-bill-by-IRN are confirmed against the sandbox (`cancelIrn`
 * included, which matters most: a guessed cancel route answering 200 with the
 * wrong body would leave a row reading CANCELLED against a registration still
 * live at NIC). The lookup-by-document route is not wired — a duplicate refusal
 * carries the registration, see `submitInvoice`.
 *
 * `generateEwayBill` lives under `/einvoice/`, not under a separate e-way bill
 * product: it is NIC's "e-way bill by IRN" and takes the same taxpayer token as
 * the IRN routes. `ewaybillapi/…` is the **standalone** e-way bill API, a
 * different product with its own application pair and no taxpayer session. Only
 * `canewb` is confirmed there; `genewaybill`, `vehewb` and `extendvalidity` are
 * NIC's own action names in the same family.
 */
const PATHS = {
  authenticate: '/einvoice/authenticate',
  generateIrn: '/einvoice/type/GENERATE/version/V1_03',
  cancelIrn: '/einvoice/type/CANCEL/version/V1_03',
  generateEwayBill: '/einvoice/type/GENERATE_EWAYBILL/version/V1_03',
  gstinDetails: '/einvoice/type/GSTNDETAILS/version/V1_03',
  taxpayerSearch: '/public/search',
  standaloneGenerate: '/ewaybillapi/v1.03/ewayapi/genewaybill',
  standalonePartB: '/ewaybillapi/v1.03/ewayapi/vehewb',
  standaloneExtend: '/ewaybillapi/v1.03/ewayapi/extendvalidity',
  standaloneCancel: '/ewaybillapi/v1.03/ewayapi/canewb',
} as const;

/**
 * The NIC portal the standalone e-way bill API runs against. Hardcoded: those
 * calls present no taxpayer token to read `irp` from, and every sandbox account
 * observed sits on NIC1. A wrong portal is a refusal, not a silent wrong action.
 */
const STANDALONE_EWAYBILL_IRP = 'NIC1';

/** NIC's "distance too high" (4038) and "too high or low" (4013): the pincodes it holds disagree with the distance given. */
const DISTANCE_REFUSED = ['4038', '4013'] as const;

/** `status_cd` when the portal did what was asked. A string, as Whitebooks sends it. */
const SUCCESS = '1';

/** The `info[].InfCd` under which a duplicate refusal carries the existing registration. */
const DUPLICATE_INFO_CODE = 'DUPIRN';

/** "No records found" from the taxpayer search: the register answering, not the gateway failing. */
const NOT_FOUND_CODE = 'FO8000';

/** Whitebooks' sandbox register knows only these; any other GSTIN is searched as the first. */
const SANDBOX_REGISTER_GSTINS = ['27AAGCB1286Q2Z3', '33AAGCB1286Q2ZA', '27AAGCB1286Q1Z4', '33AAGCB1286Q1ZB'] as const;

/**
 * What Whitebooks answers with: the verdict is `status_cd` rather than
 * `success`, the payload sits in `data` rather than `result`, and NIC's error
 * array arrives in `status_desc` with lower-cased keys.
 */
interface WhitebooksEnvelope {
  readonly irp?: unknown;
  readonly status_cd?: unknown;
  readonly status_desc?: unknown;
  readonly data?: unknown;
  readonly info?: unknown;
  readonly error?: { errorCode?: unknown; errorMessage?: unknown } | null;
}

const ENVELOPE_KEYS = ['irp', 'status_cd', 'status_desc', 'data', 'info'] as const;

/**
 * A minted taxpayer session. `irp` is which of NIC's two Invoice Registration
 * Portals the token belongs to (`"NIC1"` on the sandbox); the cancel route takes
 * it as a query parameter so the request reaches the portal that holds the
 * registration.
 */
interface Session {
  readonly token: string;
  readonly irp: string | null;
  readonly expiresAt: number;
}

type Application = { clientId: string; clientSecret: string };

type PartyBlock = Record<string, unknown>;

/** A refusal that, for NIC 2150, also carries the registration the portal already holds. */
type DuplicateAware = GspRequestError & { duplicate?: IrnRecord | null };

/**
 * E-invoice, e-way bill and taxpayer lookup through Whitebooks. **Sandbox only**
 * — refused at boot unless `TAXATION_GSTIN_ALLOW_SANDBOX=true`.
 *
 * Unlike Adaequare, the token belongs to the *taxpayer*: `authenticate` takes the
 * NIC portal username/password/gstin beside the application's `client_id` /
 * `client_secret`, and the `AuthToken` it answers with is good for that GSTIN
 * only. A single cached token would file one company's invoices under another's
 * session, so the cache is keyed by credential. It is in-process: behind a load
 * balancer each instance mints its own, once per token lifetime.
 *
 * Whitebooks issues a separate application pair per product (taxpayer lookup,
 * e-invoice, standalone e-way bill), each read from its own environment pair.
 */
export class WhitebooksGateway implements GspGateway {
  readonly name = 'gsp' as const;
  readonly gateway = 'whitebooks' as const;

  private readonly sessions = new Map<string, Session>();
  private sandboxBuyer: Promise<PartyBlock> | null = null;

  constructor(
    private readonly config: Config,
    private readonly transport: GspTransport = new FetchGspTransport(),
    private readonly clock: () => number = Date.now,
    private readonly log: (message: string) => void = () => {},
  ) {}

  // ----------------------------------------------------------------- session

  private baseUrl() {
    return baseUrlOf(gspBaseUrl(this.config));
  }

  private application(product: GspProduct, _creds: PortalCredentials | null): Application {
    const env = gspApplication(this.config, 'whitebooks', product);
    if (!env.clientId || !env.clientSecret) throw new GspConfigError(`${env.variable} must be set for the Whitebooks ${product.toLowerCase()} API.`);
    return { clientId: env.clientId, clientSecret: env.clientSecret };
  }

  private applicationHeaders(app: Application, account: { ipAddress: string }): Record<string, string> {
    return { client_id: app.clientId, client_secret: app.clientSecret, ip_address: account.ipAddress };
  }

  private filingHeaders(app: Application, account: { ipAddress: string }, creds: PortalCredentials, session: Session): Record<string, string> {
    // The password does not travel here; the token stands in for it.
    return { ...this.applicationHeaders(app, account), username: creds.username, 'auth-token': session.token, gstin: creds.gstin };
  }

  private sessionKey = (creds: PortalCredentials) => `${creds.gstin}|${creds.username}`;

  private async session(creds: PortalCredentials, app: Application, account: { email: string; ipAddress: string }): Promise<Session> {
    const key = this.sessionKey(creds);
    const cached = this.sessions.get(key);
    if (cached && cached.expiresAt - GSP_TOKEN_EXPIRY_SKEW_MS > this.clock()) return cached;
    const minted = await this.mint(creds, app, account);
    if (!minted.ok) {
      this.log(`Whitebooks refused the portal login for GSTIN ${creds.gstin}: ${minted.reason}`);
      throw new GspAuthError('The GST portal refused the stored login. Check the portal username and password.');
    }
    this.sessions.set(key, minted.session);
    return minted.session;
  }

  /** One authenticate call, reported rather than judged, so a connection test and a filing can word it differently. */
  private async mint(creds: PortalCredentials, app: Application, account: { email: string; ipAddress: string }): Promise<{ ok: true; session: Session } | { ok: false; reason: string }> {
    let envelope: GspEnvelope;
    try {
      envelope = await this.transport.get<unknown>({
        baseUrl: this.baseUrl(),
        path: PATHS.authenticate,
        token: '',
        query: { email: account.email },
        // The two accounts on one request: client_id/secret are the application's, username/password/gstin the taxpayer's.
        headers: { ...this.applicationHeaders(app, account), username: creds.username, password: creds.password, gstin: creds.gstin },
      });
    } catch (error) {
      if (error instanceof GspRequestError && !error.isUnavailable) {
        this.log(`Whitebooks authentication failed for GSTIN ${creds.gstin}: ${error.message}`);
        throw new GspAuthError();
      }
      throw error;
    }
    const body = envelope as unknown as WhitebooksEnvelope;
    const data = refused(body) ? null : readRecord<{ AuthToken?: unknown; TokenExpiry?: unknown }>(body);
    const token = data?.AuthToken;
    if (typeof token !== 'string' || token.length === 0) return { ok: false, reason: describe(body, 'no AuthToken in the response') };
    const expiry = parsePortalDateTime(data?.TokenExpiry)?.getTime() ?? this.clock() + GSP_TOKEN_FALLBACK_TTL_SECONDS * 1000;
    return { ok: true, session: { token, irp: firstString(body.irp), expiresAt: expiry } };
  }

  /**
   * A `status_cd` other than `"1"`, thrown as the error the callers already read.
   * The NIC errors are re-spelled as the PascalCase array Adaequare sends, so a
   * refusal carries every code and the 2150 branch needs no second dialect.
   */
  private refusal(body: WhitebooksEnvelope, creds: PortalCredentials): GspRequestError {
    const message = describe(body, 'The GST portal refused the request.');
    const errors = nicErrors(body);
    // A refused session is not the document's fault: drop the token so the next attempt mints a fresh one.
    if (/token|session|auth/i.test(message)) this.sessions.delete(this.sessionKey(creds));
    const translated: GspEnvelope = {
      success: false,
      message: errors.length ? JSON.stringify(errors.map((e) => ({ ErrorCode: e.code ?? '', ErrorMessage: e.text }))) : message,
    };
    // 422: the portal read the document and refused it — the caller's data to fix.
    const error = new GspRequestError(message, 'envelope', 422, translated) as DuplicateAware;
    error.duplicate = duplicateRegistrationOf(body);
    return error;
  }

  private async guard<T extends { ok: boolean }>(run: () => Promise<T>) {
    try {
      return await run();
    } catch (error) {
      return failureFrom(error, this.log);
    }
  }

  /** A call under the taxpayer's session (`/einvoice/…`). Throws the translated refusal on a `status_cd` of 0. */
  private async filing(creds: PortalCredentials, path: string, method: 'get' | 'post', opts: { body?: unknown; query?: Record<string, string>; withIrp?: boolean } = {}) {
    const account = whitebooksAccount(this.config);
    const app = this.application('EINVOICE', creds);
    const session = await this.session(creds, app, account);
    const envelope = await this.transport[method]<unknown>({
      baseUrl: this.baseUrl(),
      path,
      // No bearer: the token travels as `auth-token`, and the transport omits `Authorization` for an empty one.
      token: '',
      query: { email: account.email, ...(opts.withIrp && session.irp ? { irp: session.irp } : {}), ...opts.query },
      headers: this.filingHeaders(app, account, creds, session),
      body: opts.body,
    });
    const body = envelope as unknown as WhitebooksEnvelope;
    if (refused(body)) throw this.refusal(body, creds);
    return { body, session };
  }

  /** A call to the standalone e-way bill API: application pair and GSTIN on every call, no taxpayer session. */
  private async standalone<T>(creds: PortalCredentials, path: string, body: unknown) {
    const account = whitebooksAccount(this.config);
    const app = this.application('EWAYBILL', creds);
    const envelope = await this.transport.post<T>({
      baseUrl: this.baseUrl(),
      path,
      token: '',
      query: { email: account.email, irp: STANDALONE_EWAYBILL_IRP },
      headers: { ...this.applicationHeaders(app, account), gstin: creds.gstin, username: creds.username },
      body,
    });
    const reply = envelope as unknown as WhitebooksEnvelope;
    if (refused(reply)) throw this.refusal(reply, creds);
    return reply;
  }

  // ------------------------------------------------------------ ComplianceProvider

  async testConnection(logins: PortalLogins): Promise<ConnectionResult> {
    const check = async (creds: PortalCredentials | null, portal: string) => {
      if (!creds) return { ok: false, message: `No ${portal} credentials are stored yet` };
      try {
        const account = whitebooksAccount(this.config);
        // The e-way bill login is checked through the e-invoice API too: bills by IRN are raised under that session.
        const minted = await this.mint(creds, this.application('EINVOICE', creds), account);
        if (!minted.ok) return { ok: false, message: minted.reason };
        this.sessions.set(this.sessionKey(creds), minted.session);
        return { ok: true, message: `Authenticated as ${creds.username} on Whitebooks` };
      } catch (error) {
        return { ok: false, message: failureFrom(error, this.log).errors[0]?.message ?? 'Failed' };
      }
    };
    return { irp: await check(logins.einvoice, 'e-invoice'), ewb: await check(logins.ewaybill, 'e-way bill') };
  }

  submitInvoice(creds: PortalCredentials | null, req: Parameters<ComplianceProvider['submitInvoice']>[1]): Promise<SubmitInvoiceResult> {
    return this.guard(async () => {
      const login = requireLogin(creds);
      const payload = prepareIrnPayload(await this.withSandboxBuyer(login, req.payload));
      try {
        const { body } = await this.filing(login, PATHS.generateIrn, 'post', { body: payload });
        const record = readRecord<IrnRecord>(body);
        if (!record?.Irn) return incomplete('IRN');
        return acknowledgement(record, req.now);
      } catch (error) {
        // NIC 2150 on this gateway already carries the existing Irn / AckNo / AckDt in `info`, so the duplicate
        // is adopted from the refusal itself. NIC's duplicate answer has no signed QR; the gap is left empty,
        // not invented.
        const existing = error instanceof GspRequestError && hasErrorCode(error.envelope, NIC_ERROR_CODES.DUPLICATE_IRN) ? (error as DuplicateAware).duplicate : null;
        if (existing?.Irn) return acknowledgement(existing, req.now);
        throw error;
      }
    });
  }

  cancelIrn(creds: PortalCredentials | null, req: Parameters<ComplianceProvider['cancelIrn']>[1]): Promise<CancelIrnResult> {
    return this.guard(async () => {
      const login = requireLogin(creds);
      const { body } = await this.filing(login, PATHS.cancelIrn, 'post', {
        withIrp: true,
        body: { Irn: req.irn, CnlRsn: req.reasonCode, ...(req.remark?.trim() ? { CnlRem: req.remark.trim() } : {}) },
      });
      const record = readRecord<{ CancelDate?: string }>(body);
      if (!carriesField(record, 'CancelDate')) return incomplete('cancellation date');
      const cancelled = parsePortalDateAny(record?.CancelDate) ?? new Date(req.now);
      return { ok: true as const, cancelDate: toPortalDateTime(cancelled), reason: E_INVOICE_CANCEL_REASONS[req.reasonCode] };
    });
  }

  submitEwayBill(creds: PortalCredentials | null, req: Parameters<ComplianceProvider['submitEwayBill']>[1]): Promise<SubmitEwayBillResult> {
    return this.guard(async () => {
      const login = requireLogin(creds);
      // By IRN under the taxpayer session that registered it — `TransDocNo`/`TransDocDt`, not NIC's `TrnDocNO`/`TrnDocDt`.
      //
      // **Sandbox buyer:** NIC checks the distance against the pincodes it holds for the IRN, and with the buyer
      // substituted those are the test buyer's, not the customer's. The user's real distance is then refused as
      // too high (4038) or too high or low (4013) when NIC knows that pair, and accepted when it does not (4030 otherwise asks for
      // the actual distance, so 0 cannot be sent blind). So the real distance goes first, and 0, which makes the
      // portal work it out, is the retry for 4013. The validity the portal answers with is what gets stored.
      const sandboxBuyer = this.config.TAXATION_SANDBOX_BUYER_GSTIN !== '';
      const send = async (payload: typeof req.payload) =>
        (await this.filing(login, PATHS.generateEwayBill, 'post', { withIrp: true, body: ewayBillByIrnBody(req.irn!, payload, 'TransDocNo', 'TransDocDt') })).body;
      let reply: WhitebooksEnvelope;
      if (req.irn) {
        try {
          reply = await send(req.payload);
        } catch (error) {
          if (!(sandboxBuyer && error instanceof GspRequestError && DISTANCE_REFUSED.some((code) => hasErrorCode(error.envelope, code)))) throw error;
          reply = await send({ ...req.payload, transDistance: 0 });
        }
      } else {
        reply = await this.standalone(login, PATHS.standaloneGenerate, nativeEwayBillBody(req.payload));
      }
      return ewayBillResult(readRecord<EwbRecord>(reply), req) ?? incomplete('e-way bill number');
    });
  }

  updatePartB(creds: PortalCredentials | null, req: Parameters<ComplianceProvider['updatePartB']>[1]): Promise<UpdatePartBResult> {
    return this.guard(async () => {
      const login = requireLogin(creds);
      const reply = await this.standalone(login, PATHS.standalonePartB, partBBody(req));
      const record = readRecord<{ vehUpdDate?: string }>(reply);
      return { ok: true as const, updatedAt: (parsePortalDateAny(record?.vehUpdDate) ?? new Date(req.now)).toISOString() };
    });
  }

  extend(creds: PortalCredentials | null, req: Parameters<ComplianceProvider['extend']>[1]): Promise<ExtendResult> {
    return this.guard(async () => {
      const login = requireLogin(creds);
      const reply = await this.standalone(login, PATHS.standaloneExtend, extendBody(req));
      const validUpto = parsePortalDateAny(readRecord<{ validUpto?: string }>(reply)?.validUpto);
      return validUpto ? { ok: true as const, newValidUpto: validUpto.toISOString() } : incomplete('new validity');
    });
  }

  cancelEwayBill(creds: PortalCredentials | null, req: Parameters<ComplianceProvider['cancelEwayBill']>[1]): Promise<CancelEwayBillResult> {
    return this.guard(async () => {
      const login = requireLogin(creds);
      if (!Number.isSafeInteger(Number(req.ewayBillNumber))) return incomplete(`usable e-way bill number (got "${req.ewayBillNumber}")`);
      const reply = await this.standalone(login, PATHS.standaloneCancel, cancelEwayBillBody(req.ewayBillNumber, req.reasonCode, req.remark?.trim()));
      const record = readRecord<{ cancelDate?: string }>(reply);
      // Present, not parseable: the sandbox answers 12-hour with an AM/PM suffix, a third date format.
      if (!carriesField(record, 'cancelDate')) return incomplete('cancellation date');
      const cancelled = parsePortalDateAny(record?.cancelDate) ?? new Date(req.now);
      return { ok: true as const, cancelledAt: cancelled.toISOString(), reason: EWAY_CANCEL_REASONS[req.reasonCode] };
    });
  }

  // -------------------------------------------------------------- sandbox buyer

  /**
   * **Sandbox only.** The sandbox refuses any buyer GSTIN it has not registered
   * (3028), so an invoice raised to a real customer could never be e-invoiced.
   * With `TAXATION_SANDBOX_BUYER_GSTIN` set, the whole `BuyerDtls` block is
   * replaced by the one NIC holds for that GSTIN — name, address, pincode and
   * state together, so they agree with each other the way NIC checks them
   * (3039). Place of supply and the amounts are untouched. The customer's own
   * invoice, PDF and audit trail are not.
   */
  private async withSandboxBuyer<P extends { BuyerDtls: { Gstin: string; Pos: string } }>(creds: PortalCredentials, payload: P): Promise<P> {
    const sandboxGstin = this.config.TAXATION_SANDBOX_BUYER_GSTIN;
    // B2C carries no buyer GSTIN and is never e-invoiced; nothing to substitute.
    if (!sandboxGstin || !payload.BuyerDtls.Gstin || payload.BuyerDtls.Gstin === 'URP') return payload;
    // The promise is the memo, so two filings in flight share one lookup; a failed one is forgotten.
    this.sandboxBuyer ??= this.fetchParty(creds, sandboxGstin).catch((error) => {
      this.sandboxBuyer = null;
      throw error;
    });
    const party = await this.sandboxBuyer;
    this.log(`Filing with sandbox buyer ${sandboxGstin} in place of ${payload.BuyerDtls.Gstin}`);
    return { ...payload, BuyerDtls: { ...party, Pos: payload.BuyerDtls.Pos } };
  }

  /** NIC's "Get GSTIN details" under Whitebooks' spelling, as a `BuyerDtls` block. */
  private async fetchParty(creds: PortalCredentials, gstin: string): Promise<PartyBlock> {
    const { body } = await this.filing(creds, PATHS.gstinDetails, 'get', { query: { param1: gstin } });
    const party = toBuyerBlock(readRecord<Record<string, unknown>>(body));
    // `status_cd: "1"` over a record missing its name, pincode or state: filing with a half-empty buyer would only move the refusal to NIC.
    if (!party) throw new GspRequestError(`The portal's register returned an incomplete registration for ${gstin}.`, 'envelope', 422, null);
    return party;
  }

  // -------------------------------------------------------------- taxpayer lookup

  /**
   * `GET /public/search?email=…&gstin=…` with `client_id` / `client_secret`
   * headers from the taxpayer-lookup pair. No bearer, no portal login. Unknown
   * GSTINs arrive as a 200 carrying `{ error: { errorCode: 'FO8000' } }`.
   */
  async lookupTaxpayer(gstin: string): Promise<Record<string, unknown> | null> {
    const { email } = whitebooksSettings(this.config);
    if (!email) throw new GspConfigError('Whitebooks requires an account email — set TAXATION_WHITEBOOKS_ACCOUNT_EMAIL.');
    const app = this.application('TAXPAYER', null);
    const searched = (SANDBOX_REGISTER_GSTINS as readonly string[]).includes(gstin) ? gstin : SANDBOX_REGISTER_GSTINS[0];
    const envelope = await this.transport.get<Record<string, unknown>>({
      baseUrl: this.baseUrl(),
      path: PATHS.taxpayerSearch,
      token: '',
      query: { email, gstin: searched },
      // Sent in the headers as well as the query string, which is what the published sandbox contract asks for.
      headers: { client_id: app.clientId, client_secret: app.clientSecret, email, gstin: searched },
    });
    const body = envelope as unknown as WhitebooksEnvelope;
    // Read BEFORE the record: a not-found body carries `error` and no `data`.
    if (asCode(body.error?.errorCode) === NOT_FOUND_CODE) return null;
    const record = (body as { data?: unknown }).data;
    return isRecord(record) && Object.keys(record).length > 0 ? record : null;
  }
}

// ---------------------------------------------------------------------------
// Reading the envelope
// ---------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function firstString(...values: readonly unknown[]): string | null {
  for (const value of values) if (typeof value === 'string' && value.trim() !== '') return value.trim();
  return null;
}

/**
 * Whether the body is an envelope that says no. A body carrying none of the
 * envelope's keys is a bare record from a stand-in gateway (or nothing at all),
 * and `readRecord` is the one to judge it.
 */
function refused(body: WhitebooksEnvelope): boolean {
  if (!isRecord(body) || !ENVELOPE_KEYS.some((key) => key in body)) return false;
  // A string in every observed response; tolerated as a number.
  return body.status_cd !== SUCCESS && body.status_cd !== Number(SUCCESS);
}

/** `data`, or the body itself when it is not an envelope. */
function readRecord<T>(body: WhitebooksEnvelope): T | null {
  if (!isRecord(body)) return null;
  if ('data' in body) return isRecord(body.data) ? (body.data as T) : null;
  if (ENVELOPE_KEYS.some((key) => key in body)) return null;
  return body as unknown as T;
}

type WbError = { code: string | null; text: string };

/**
 * NIC's error array, forwarded as a string of JSON in `status_desc` with
 * lower-cased keys (`errorCode`, `errorMessage`); NIC's own PascalCase is read
 * too, in case a gateway stops re-casing them.
 */
function nicErrors(body: WhitebooksEnvelope): WbError[] {
  const raw = typeof body.status_desc === 'string' ? body.status_desc.trim() : '';
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((entry): WbError[] => {
    if (!isRecord(entry)) return [];
    const text = firstString(entry.errorMessage, entry.ErrorMessage);
    const code = asCode(entry.errorCode ?? entry.ErrorCode);
    return text === null && code === null ? [] : [{ code, text: text ?? '' }];
  });
}

/** `'Duplicate IRN (2150)'`, or the plain `status_desc`, or the fallback. */
function describe(body: WhitebooksEnvelope, fallback: string): string {
  const described = nicErrors(body)
    .map((e) => (e.text === '' ? (e.code ?? '') : e.code === null ? e.text : `${e.text} (${e.code})`))
    .filter(Boolean)
    .join('; ');
  if (described) return described;
  const raw = typeof body.status_desc === 'string' ? body.status_desc.trim() : '';
  return raw || fallback;
}

/** Pulls the registration a `DUPIRN` info block names out of a refusal body. */
export function duplicateRegistrationOf(body: WhitebooksEnvelope): IrnRecord | null {
  if (!Array.isArray(body.info)) return null;
  for (const entry of body.info as unknown[]) {
    if (!isRecord(entry) || entry.InfCd !== DUPLICATE_INFO_CODE || !isRecord(entry.Desc)) continue;
    const record = entry.Desc as IrnRecord;
    if (record.Irn) return record;
  }
  return null;
}

/**
 * NIC's GSTIN record as a `BuyerDtls` block, or null when it lacks what a
 * buyer cannot do without. The address arrives in pieces; line 1 is building
 * number, floor and name, line 2 the street, and a sparse register falls back to
 * the locality so the mandatory line 1 is never blank. Cut to NIC's 100 chars.
 */
function toBuyerBlock(record: Record<string, unknown> | null): PartyBlock | null {
  if (!record) return null;
  const gstin = firstString(record.Gstin);
  const legalName = firstString(record.LegalName);
  const location = firstString(record.AddrLoc);
  const pincode = wholeNumberOf(record.AddrPncd);
  const stateCode = stateCodeOf(record.StateCode);
  if (!gstin || !legalName || !location || pincode === null || !stateCode) return null;
  const line1 = [record.AddrBno, record.AddrFlno, record.AddrBnm].map((p) => firstString(p)).filter((p): p is string => p !== null).join(', ');
  const line2 = firstString(record.AddrSt);
  const trade = firstString(record.TradeName);
  return {
    Gstin: gstin,
    LglNm: legalName.slice(0, 100),
    ...(trade ? { TrdNm: trade.slice(0, 100) } : {}),
    Addr1: (line1 || location).slice(0, 100),
    ...(line2 ? { Addr2: line2.slice(0, 100) } : {}),
    Loc: location.slice(0, 100),
    Pin: pincode,
    Stcd: stateCode,
  };
}

function wholeNumberOf(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(firstString(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/** `29` or `"29"` — and `7` or `"7"` — as the two-digit code the document carries. */
function stateCodeOf(value: unknown): string | null {
  const parsed = wholeNumberOf(value);
  return parsed === null || parsed > 99 ? null : String(parsed).padStart(2, '0');
}
