import { randomUUID } from 'node:crypto';
import type { Config } from '../../config';
import { gspBaseUrl } from '../../config';
import {
  ReturnsError,
  type Ctx,
  type Gstr2bEntry,
  type Gstr2bResult,
  type Ledgers,
  type PortalSession,
  type ReturnStatus,
  type ReturnType,
  type ReturnsProvider,
  type TrackedReturn,
} from '../returns';
import { baseUrlOf } from './common';
import { GSP_TOKEN_EXPIRY_SKEW_MS } from './constants';
import { gspApplication } from './provider-name';
import { FetchGspTransport, GspAuthError, GspConfigError, GspRequestError, type GspTransport } from './transport';

/**
 * Adaequare's GST returns ("taxpayer") API, joined onto `TAXATION_GSP_BASE_URL`.
 *
 * **Every route here is unconfirmed.** They follow GSTN's taxpayer API (action names RETSAVE,
 * RETOFFSET, RETSTATUS, RETNEWPTF, RETFILE, RETTRACK, OTPREQUEST, AUTHTOKEN, REFRESHTOKEN, EVCOTP)
 * under Adaequare's `/enriched/gsp/taxpayerapi` wrapper, which does GSTN's payload encryption.
 * Run each against Adaequare's sandbox before filing for anyone (see README.md), and keep
 * GST_FILING_ENABLED off until then.
 */
const API = '/enriched/gsp/taxpayerapi';
const PATHS = {
  authenticate: `${API}/v1.0/authenticate`,
  gstr2b: `${API}/v1.0/returns/gstr2b`,
  gstr1: `${API}/v3.0/returns/gstr1`,
  gstr3b: `${API}/v3.0/returns/gstr3b`,
  returns: `${API}/v1.0/returns`,
  ledgers: `${API}/v1.0/ledgers`,
} as const;

/** Portal session tokens last 6 hours unless the portal says otherwise. */
const SESSION_MS = 6 * 3_600_000;
/** The taxpayer chooses up to 30 days of refresh when switching API access on. */
const REFRESH_MS = 30 * 24 * 3_600_000;

const r = (rupees: unknown) => Math.round(Number(rupees ?? 0) * 100);
/** dd-mm-yyyy → yyyy-mm-dd */
const iso = (dmy: unknown) => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(dmy ?? ''));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(dmy ?? '');
};

type Item = { txval?: number; igst?: number; cgst?: number; sgst?: number; cess?: number };
const sumItems = (items: Item[] | undefined, single: Item) => {
  const list = items?.length ? items : [single];
  return list.reduce(
    (a, i) => ({ taxableMinor: a.taxableMinor + r(i.txval), igstMinor: a.igstMinor + r(i.igst), cgstMinor: a.cgstMinor + r(i.cgst), sgstMinor: a.sgstMinor + r(i.sgst), cessMinor: a.cessMinor + r(i.cess) }),
    { taxableMinor: 0, igstMinor: 0, cgstMinor: 0, sgstMinor: 0, cessMinor: 0 },
  );
};

/**
 * GSTR-2B as GSTN publishes it (`data.docdata.b2b`, `b2ba`, `cdnr`, `cdnra`, `impg`, `impgsez`, `isd`), flattened into
 * one entry per supplier document. Amounts are rupees there, paise here. The JSON a taxpayer downloads from
 * the portal (Returns → GSTR-2B → Download JSON) has the same shape, so an uploaded file is read here too.
 */
export function parseGstr2b(json: unknown): Gstr2bResult {
  const data = (json as { data?: { gendt?: string; docdata?: Record<string, unknown[]> } })?.data;
  if (!data?.docdata) return { status: 'notGenerated' };
  const d = data.docdata;
  const entries: Gstr2bEntry[] = [];
  type Supplier = { ctin: string; trdnm?: string; supfildt?: string; inv?: Record<string, unknown>[]; nt?: Record<string, unknown>[] };
  for (const section of ['b2b', 'b2ba'] as const) {
    for (const s of (d[section] ?? []) as Supplier[]) {
      for (const inv of s.inv ?? []) {
        entries.push({
          section,
          supplierGstin: s.ctin,
          supplierName: s.trdnm,
          documentType: 'I',
          number: String(inv.inum),
          date: iso(inv.dt),
          placeOfSupply: inv.pos as string | undefined,
          reverseCharge: inv.rev === 'Y',
          ...sumItems(inv.items as Item[] | undefined, inv as Item),
          itcAvailable: inv.itcavl !== 'N',
          itcReason: (inv.rsn as string | undefined) || undefined,
          supplierFiledOn: s.supfildt ? iso(s.supfildt) : undefined,
          originalNumber: (inv.oinum as string | undefined) || undefined,
        });
      }
    }
  }
  for (const section of ['cdnr', 'cdnra'] as const) {
    for (const s of (d[section] ?? []) as Supplier[]) {
      for (const nt of s.nt ?? []) {
        entries.push({
          section,
          supplierGstin: s.ctin,
          supplierName: s.trdnm,
          documentType: nt.typ === 'D' ? 'D' : 'C',
          number: String(nt.ntnum),
          date: iso(nt.dt),
          placeOfSupply: nt.pos as string | undefined,
          reverseCharge: nt.rev === 'Y',
          ...sumItems(nt.items as Item[] | undefined, nt as Item),
          itcAvailable: nt.itcavl !== 'N',
          itcReason: (nt.rsn as string | undefined) || undefined,
          supplierFiledOn: s.supfildt ? iso(s.supfildt) : undefined,
          originalNumber: (nt.ontnum as string | undefined) || undefined,
        });
      }
    }
  }
  // Imports from overseas (impg) and from a SEZ (impgsez, grouped under the SEZ unit): both by bill of entry.
  const boes = [...((d.impg ?? []) as Record<string, unknown>[]), ...((d.impgsez ?? []) as { boe?: Record<string, unknown>[] }[]).flatMap((s) => s.boe ?? [])];
  for (const boe of boes) {
    entries.push({
      section: 'impg',
      supplierGstin: String(boe.portcode ?? ''),
      documentType: 'BOE',
      number: String(boe.boenum),
      date: iso(boe.boedt),
      reverseCharge: false,
      taxableMinor: r(boe.txval),
      igstMinor: r(boe.igst),
      cgstMinor: 0,
      sgstMinor: 0,
      cessMinor: r(boe.cess),
      itcAvailable: true,
    });
  }
  // Credit an Input Service Distributor passed on: invoices only (an ISD credit note reduces it).
  type IsdSupplier = { ctin: string; trdnm?: string; supfildt?: string; doclist?: Record<string, unknown>[] };
  for (const s of (d.isd ?? []) as IsdSupplier[]) {
    for (const doc of s.doclist ?? []) {
      const credit = doc.doctyp === 'C' ? -1 : 1;
      entries.push({
        section: 'isd',
        supplierGstin: s.ctin,
        supplierName: s.trdnm,
        documentType: 'ISD',
        number: String(doc.docnum),
        date: iso(doc.docdt),
        reverseCharge: false,
        taxableMinor: 0,
        igstMinor: credit * r(doc.igst),
        cgstMinor: credit * r(doc.cgst),
        sgstMinor: credit * r(doc.sgst),
        cessMinor: credit * r(doc.cess),
        itcAvailable: doc.itcelg !== 'N',
        supplierFiledOn: s.supfildt ? iso(s.supfildt) : undefined,
      });
    }
  }
  return { status: 'generated', generatedAt: iso(data.gendt), entries };
}

/** A portal error code in a message: AUTH4033, RET191106, RT-EVC-01. */
const CODES = /\b(AUTH\d+|RET\d+|RT-[A-Z0-9-]+)\b/g;

export class AdaequareReturns implements ReturnsProvider {
  readonly name = 'gsp';
  private bearer: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly config: Config,
    private readonly transport: GspTransport = new FetchGspTransport(),
    private readonly clock: () => number = Date.now,
  ) {}

  private async token(): Promise<string> {
    if (!this.config.TAXATION_GSP_AUTH_REQUIRED) return '';
    if (this.bearer && this.bearer.expiresAt - GSP_TOKEN_EXPIRY_SKEW_MS > this.clock()) return this.bearer.value;
    const app = gspApplication(this.config, 'adaequare', 'TAXPAYER');
    if (!app.clientId || !app.clientSecret) throw new GspConfigError(`${app.variable} must be set for GST returns.`);
    const minted = await this.transport.authenticate({ baseUrl: baseUrlOf(gspBaseUrl(this.config)), clientId: app.clientId, clientSecret: app.clientSecret });
    this.bearer = { value: minted.accessToken, expiresAt: this.clock() + minted.expiresInSeconds * 1000 };
    return this.bearer.value;
  }

  /** One call: the GSP bearer, the taxpayer's headers, and the portal's failures in our terms. */
  private async call<T>(method: 'get' | 'post', path: string, gstin: string, opts: { username?: string; authToken?: string; period?: string; query?: Record<string, string>; body?: unknown } = {}): Promise<T> {
    const headers: Record<string, string> = {
      gstin,
      'state-cd': gstin.slice(0, 2),
      requestid: randomUUID(),
      ...(opts.username && { username: opts.username }),
      ...(opts.authToken && { 'auth-token': opts.authToken }),
      ...(opts.period && { ret_period: opts.period }),
    };
    try {
      const request = { baseUrl: baseUrlOf(gspBaseUrl(this.config)), path, token: await this.token(), headers, query: opts.query, body: opts.body };
      const envelope = method === 'get' ? await this.transport.get<T>(request) : await this.transport.post<T>(request);
      return (envelope.result ?? (envelope as unknown as { data: T }).data) as T;
    } catch (error) {
      if (error instanceof GspAuthError || error instanceof GspConfigError) throw new ReturnsError('NOT_CONFIGURED', error.message);
      if (error instanceof GspRequestError) {
        if (error.isUnavailable) throw new ReturnsError('UNANSWERED', 'No answer from the GST portal');
        const codes = [...new Set(error.message.match(CODES) ?? [])];
        if (codes.some((c) => c.startsWith('AUTH'))) throw new ReturnsError('SESSION_EXPIRED', 'The GST portal session has expired', codes);
        throw new ReturnsError('PORTAL_REFUSED', error.message, codes);
      }
      throw error;
    }
  }

  private session(token: { auth_token?: string; expiry?: number }): PortalSession {
    if (!token.auth_token) throw new ReturnsError('PORTAL_REFUSED', 'The portal gave no session');
    const now = this.clock();
    return { authToken: token.auth_token, expiresAt: new Date(now + (token.expiry ? token.expiry * 60_000 : SESSION_MS)), refreshableUntil: new Date(now + REFRESH_MS) };
  }

  async requestOtp(gstin: string, username: string) {
    await this.call('post', PATHS.authenticate, gstin, { username, body: { action: 'OTPREQUEST', username } });
  }
  async authenticate(gstin: string, username: string, otp: string) {
    return this.session(await this.call<{ auth_token?: string; expiry?: number }>('post', PATHS.authenticate, gstin, { username, body: { action: 'AUTHTOKEN', username, otp } }));
  }
  async refresh(gstin: string, username: string, session: PortalSession) {
    const fresh = this.session(await this.call<{ auth_token?: string; expiry?: number }>('post', PATHS.authenticate, gstin, { username, authToken: session.authToken, body: { action: 'REFRESHTOKEN', username, auth_token: session.authToken } }));
    return { ...fresh, refreshableUntil: session.refreshableUntil };
  }

  private auth(ctx: Ctx, period?: string) {
    return { username: ctx.username, authToken: ctx.session.authToken, period };
  }

  async getGstr2b(ctx: Ctx, period: string): Promise<Gstr2bResult> {
    try {
      const json = await this.call<unknown>('get', PATHS.gstr2b, ctx.gstin, { ...this.auth(ctx, period), query: { gstin: ctx.gstin, rtnprd: period } });
      return parseGstr2b({ data: json });
    } catch (error) {
      // RET2B1016 and kin: not generated for the period yet.
      if (error instanceof ReturnsError && error.portalCodes.some((c) => c.startsWith('RET2B'))) return { status: 'notGenerated' };
      throw error;
    }
  }
  async save(ctx: Ctx, returnType: ReturnType, period: string, payload: unknown) {
    const res = await this.call<{ reference_id?: string }>('post', PATHS[returnType], ctx.gstin, { ...this.auth(ctx, period), body: { action: 'RETSAVE', data: payload } });
    return { referenceId: String(res.reference_id ?? '') };
  }
  async offset(ctx: Ctx, period: string, utilization: unknown) {
    const res = await this.call<{ reference_id?: string }>('post', PATHS.gstr3b, ctx.gstin, { ...this.auth(ctx, period), body: { action: 'RETOFFSET', data: utilization } });
    return { referenceId: String(res.reference_id ?? '') };
  }
  async returnStatus(ctx: Ctx, period: string, referenceId: string): Promise<ReturnStatus> {
    const res = await this.call<{ status_cd?: string; error_report?: { error_msg?: string }[] }>('get', PATHS.returns, ctx.gstin, { ...this.auth(ctx, period), query: { action: 'RETSTATUS', gstin: ctx.gstin, ret_period: period, ref_id: referenceId } });
    const map: Record<string, ReturnStatus['status']> = { P: 'processed', PE: 'processedWithErrors', IP: 'inProgress', ER: 'error' };
    return { status: map[res.status_cd ?? ''] ?? 'inProgress', errors: res.error_report?.map((e) => e.error_msg ?? '').filter(Boolean) };
  }
  async summary(ctx: Ctx, returnType: ReturnType, period: string) {
    const res = await this.call<{ ttl_tax?: number; ttl_txval?: number; chksum?: string }>('get', PATHS[returnType], ctx.gstin, { ...this.auth(ctx, period), query: { action: 'RETSUM', gstin: ctx.gstin, ret_period: period } });
    return { taxableMinor: r(res.ttl_txval), taxMinor: r(res.ttl_tax), hash: String(res.chksum ?? '') };
  }
  async proceedToFile(ctx: Ctx, returnType: ReturnType, period: string) {
    const res = await this.call<{ reference_id?: string }>('post', PATHS[returnType], ctx.gstin, { ...this.auth(ctx, period), body: { action: 'RETNEWPTF', data: { gstin: ctx.gstin, ret_period: period } } });
    return { referenceId: String(res.reference_id ?? '') };
  }
  async requestEvc(ctx: Ctx, returnType: ReturnType, pan: string) {
    await this.call('get', PATHS.authenticate, ctx.gstin, { ...this.auth(ctx), query: { action: 'EVCOTP', pan, form_type: returnType === 'gstr1' ? 'R1' : 'R3B' } });
  }
  async file(ctx: Ctx, returnType: ReturnType, period: string, pan: string, evcOtp: string, summaryHash: string) {
    const res = await this.call<{ ack_num?: string }>('post', PATHS[returnType], ctx.gstin, { ...this.auth(ctx, period), body: { action: 'RETFILE', data: { chksum: summaryHash }, st: 'EVC', sid: `${pan}|${evcOtp}` } });
    if (!res.ack_num) throw new ReturnsError('UNANSWERED', 'Filed without an acknowledgement number; check the return status');
    return { arn: res.ack_num };
  }
  async trackReturns(ctx: Ctx, fy: string): Promise<TrackedReturn[]> {
    const res = await this.call<{ EFiledlist?: { rtntype?: string; ret_prd?: string; status?: string; arn?: string; dof?: string }[] }>('get', PATHS.returns, ctx.gstin, { ...this.auth(ctx), query: { action: 'RETTRACK', gstin: ctx.gstin, fy } });
    return (res.EFiledlist ?? [])
      .filter((x) => x.rtntype === 'GSTR1' || x.rtntype === 'GSTR3B')
      .map((x) => ({
        returnType: x.rtntype === 'GSTR1' ? ('gstr1' as const) : ('gstr3b' as const),
        period: String(x.ret_prd),
        status: x.status === 'Filed' ? ('filed' as const) : x.status === 'Submitted' ? ('submitted' as const) : ('notFiled' as const),
        arn: x.arn || undefined,
        filedOn: x.dof ? iso(x.dof) : undefined,
      }));
  }
  async ledgers(ctx: Ctx, period: string): Promise<Ledgers> {
    type Bal = { igst?: { tx?: number }; cgst?: { tx?: number }; sgst?: { tx?: number }; cess?: { tx?: number } };
    const res = await this.call<{ cash_bal?: Bal; itc_blnc?: { igst_bal?: number; cgst_bal?: number; sgst_bal?: number; cess_bal?: number } }>('get', PATHS.ledgers, ctx.gstin, { ...this.auth(ctx, period), query: { action: 'BAL', gstin: ctx.gstin, ret_period: period } });
    const c = res.cash_bal ?? {};
    const i = res.itc_blnc ?? {};
    return {
      cash: { igst: r(c.igst?.tx), cgst: r(c.cgst?.tx), sgst: r(c.sgst?.tx), cess: r(c.cess?.tx) },
      credit: { igst: r(i.igst_bal), cgst: r(i.cgst_bal), sgst: r(i.sgst_bal), cess: r(i.cess_bal) },
    };
  }
}
