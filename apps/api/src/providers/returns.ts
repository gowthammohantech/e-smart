import { randomUUID } from 'node:crypto';
import type { Config } from '../config';
import { AdaequareReturns } from './gsp/returns';

/**
 * GST returns through a GSP: the taxpayer's own session on the GST portal, GSTR-2B, and saving and
 * filing GSTR-1 and GSTR-3B. Separate from e-invoice and e-way bill (compliance.ts): these act for
 * the taxpayer, with their portal username and an OTP to their registered phone, not the GSP's
 * API login.
 *
 * Every method that changes something on the portal can lose its answer. Callers record an attempt
 * first and settle it by `returnStatus` (or `trackReturns`), never by trying again.
 */

export type ReturnType = 'gstr1' | 'gstr3b';

/** The portal session: valid six hours, refreshable for up to 30 days per the taxpayer's portal setting. */
export type PortalSession = { authToken: string; expiresAt: Date; refreshableUntil: Date };

/** One supplier document in GSTR-2B, as the returns need it. Amounts in paise. */
export type Gstr2bEntry = {
  section: 'b2b' | 'b2ba' | 'cdnr' | 'cdnra' | 'impg' | 'isd';
  supplierGstin: string;
  supplierName?: string;
  /** I invoice, C credit note, D debit note; bill of entry for imports; an ISD's invoice. */
  documentType: 'I' | 'C' | 'D' | 'BOE' | 'ISD';
  number: string;
  date: string;
  placeOfSupply?: string;
  reverseCharge: boolean;
  taxableMinor: number;
  igstMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  cessMinor: number;
  /** Can this be claimed (Y), and if not, why (the portal's reason). */
  itcAvailable: boolean;
  itcReason?: string;
  /** When the supplier filed it (their GSTR-1 or IFF). */
  supplierFiledOn?: string;
  /** The original number, for an amendment (B2BA/CDNRA). */
  originalNumber?: string;
};

export type Gstr2bResult = { status: 'generated'; generatedAt: string; entries: Gstr2bEntry[] } | { status: 'notGenerated' };

export type ReturnStatus = { status: 'processed' | 'processedWithErrors' | 'inProgress' | 'error'; errors?: string[] };

export type TrackedReturn = { returnType: ReturnType; period: string; status: 'notFiled' | 'submitted' | 'filed'; arn?: string; filedOn?: string };

/** The electronic cash and credit ledgers: what can pay the month's tax. Paise. */
export type Ledgers = { cash: Record<'igst' | 'cgst' | 'sgst' | 'cess', number>; credit: Record<'igst' | 'cgst' | 'sgst' | 'cess', number> };

export class ReturnsError extends Error {
  constructor(
    /** SESSION_EXPIRED: ask for a new OTP. PORTAL_REFUSED: the portal said no (errors carries why). UNANSWERED: no answer; settle by status. */
    readonly code: 'SESSION_EXPIRED' | 'PORTAL_REFUSED' | 'UNANSWERED' | 'NOT_CONFIGURED' | 'NOT_FOUND',
    message: string,
    readonly portalCodes: string[] = [],
  ) {
    super(message);
  }
}

export interface ReturnsProvider {
  readonly name: string;
  /** Sends an OTP to the taxpayer's registered phone (the portal needs API access switched on). */
  requestOtp(gstin: string, username: string): Promise<void>;
  authenticate(gstin: string, username: string, otp: string): Promise<PortalSession>;
  refresh(gstin: string, username: string, session: PortalSession): Promise<PortalSession>;
  getGstr2b(ctx: Ctx, period: string): Promise<Gstr2bResult>;
  /** Saves a return's data; the portal processes it later (returnStatus with the reference). */
  save(ctx: Ctx, returnType: ReturnType, period: string, payload: unknown): Promise<{ referenceId: string }>;
  /** GSTR-3B only: sets off the liability from credit and cash, as `utilization` says. */
  offset(ctx: Ctx, period: string, utilization: unknown): Promise<{ referenceId: string }>;
  returnStatus(ctx: Ctx, period: string, referenceId: string): Promise<ReturnStatus>;
  /** The portal's summary of what was saved, to compare with ours before filing. */
  summary(ctx: Ctx, returnType: ReturnType, period: string): Promise<{ taxableMinor: number; taxMinor: number; hash: string }>;
  /** GSTR-1: freezes the saved data for filing. */
  proceedToFile(ctx: Ctx, returnType: ReturnType, period: string): Promise<{ referenceId: string }>;
  /** Sends the EVC OTP to the authorised signatory's phone. */
  requestEvc(ctx: Ctx, returnType: ReturnType, pan: string): Promise<void>;
  file(ctx: Ctx, returnType: ReturnType, period: string, pan: string, evcOtp: string, summaryHash: string): Promise<{ arn: string }>;
  trackReturns(ctx: Ctx, fy: string): Promise<TrackedReturn[]>;
  ledgers(ctx: Ctx, period: string): Promise<Ledgers>;
}

/** Who and with what session a call is made. */
export type Ctx = { gstin: string; username: string; session: PortalSession };

const HOUR = 3_600_000;

/**
 * In-process stand-in: OTP 575757, 2B for any period before the current one, saves processed at
 * once, filing gives an ARN. Tests drive its failure modes.
 */
export class ReturnsSimulator implements ReturnsProvider {
  readonly name = 'simulator';
  static readonly OTP = '575757';
  /** 2B entries a test hands in, by GSTIN and period. */
  readonly gstr2b = new Map<string, Gstr2bEntry[]>();
  readonly saved = new Map<string, { payload: unknown; referenceId: string }>();
  readonly filed = new Map<string, { arn: string; filedOn: string }>();
  readonly calls: { op: string; gstin: string; period?: string }[] = [];
  private lose = new Set<string>();
  private expireNext = false;
  private refuseNext: string[] | null = null;
  ledger: Ledgers = { cash: { igst: 0, cgst: 0, sgst: 0, cess: 0 }, credit: { igst: 0, cgst: 0, sgst: 0, cess: 0 } };

  constructor(private readonly now: () => Date = () => new Date()) {}

  reset() {
    this.gstr2b.clear();
    this.saved.clear();
    this.filed.clear();
    this.calls.length = 0;
    this.lose.clear();
    this.expireNext = false;
    this.refuseNext = null;
    this.ledger = { cash: { igst: 0, cgst: 0, sgst: 0, cess: 0 }, credit: { igst: 0, cgst: 0, sgst: 0, cess: 0 } };
  }

  /** The next call to `op` does its work but its answer never arrives. */
  loseNext(op: 'save' | 'offset' | 'file' | 'proceedToFile') {
    this.lose.add(op);
  }
  expireSessionNext() {
    this.expireNext = true;
  }
  refuseNextWith(codes: string[]) {
    this.refuseNext = codes;
  }

  private gate(op: string, ctx?: Ctx, period?: string) {
    this.calls.push({ op, gstin: ctx?.gstin ?? '', period });
    if (this.expireNext && ctx) {
      this.expireNext = false;
      throw new ReturnsError('SESSION_EXPIRED', 'The GST portal session has expired');
    }
    if (ctx && ctx.session.expiresAt < this.now()) throw new ReturnsError('SESSION_EXPIRED', 'The GST portal session has expired');
    if (this.refuseNext && op !== 'returnStatus' && op !== 'trackReturns') {
      const codes = this.refuseNext;
      this.refuseNext = null;
      throw new ReturnsError('PORTAL_REFUSED', `The portal refused: ${codes.join(', ')}`, codes);
    }
  }
  private maybeLose(op: string) {
    if (this.lose.delete(op)) throw new ReturnsError('UNANSWERED', 'No answer from the GST portal');
  }

  async requestOtp(gstin: string) {
    this.gate('requestOtp', undefined);
    void gstin;
  }
  async authenticate(gstin: string, _username: string, otp: string) {
    this.gate('authenticate');
    if (otp !== ReturnsSimulator.OTP) throw new ReturnsError('PORTAL_REFUSED', 'Wrong OTP', ['AUTH4033']);
    const now = this.now().getTime();
    return { authToken: `sim-${gstin}-${randomUUID()}`, expiresAt: new Date(now + 6 * HOUR), refreshableUntil: new Date(now + 30 * 24 * HOUR) };
  }
  async refresh(_gstin: string, _username: string, session: PortalSession) {
    this.gate('refresh');
    const now = this.now().getTime();
    if (session.refreshableUntil.getTime() < now) throw new ReturnsError('SESSION_EXPIRED', 'Ask for a new OTP');
    return { ...session, expiresAt: new Date(now + 6 * HOUR) };
  }
  async getGstr2b(ctx: Ctx, period: string): Promise<Gstr2bResult> {
    this.gate('getGstr2b', ctx, period);
    const entries = this.gstr2b.get(`${ctx.gstin}|${period}`);
    if (!entries) return { status: 'notGenerated' };
    return { status: 'generated', generatedAt: this.now().toISOString(), entries };
  }
  async save(ctx: Ctx, returnType: ReturnType, period: string, payload: unknown) {
    this.gate('save', ctx, period);
    const referenceId = `REF${randomUUID().slice(0, 8).toUpperCase()}`;
    this.saved.set(`${ctx.gstin}|${returnType}|${period}`, { payload, referenceId });
    this.maybeLose('save');
    return { referenceId };
  }
  async offset(ctx: Ctx, period: string, utilization: unknown) {
    this.gate('offset', ctx, period);
    void utilization;
    const referenceId = `OFF${randomUUID().slice(0, 8).toUpperCase()}`;
    this.maybeLose('offset');
    return { referenceId };
  }
  async returnStatus(ctx: Ctx, period: string, referenceId: string): Promise<ReturnStatus> {
    this.gate('returnStatus', ctx, period);
    const known = [...this.saved.values()].some((s) => s.referenceId === referenceId) || referenceId.startsWith('OFF');
    return known ? { status: 'processed' } : { status: 'error', errors: ['RET191106: reference not found'] };
  }
  async summary(ctx: Ctx, returnType: ReturnType, period: string) {
    this.gate('summary', ctx, period);
    const s = this.saved.get(`${ctx.gstin}|${returnType}|${period}`);
    if (!s) throw new ReturnsError('NOT_FOUND', 'Nothing saved for this period');
    const totals = (s.payload as { totals?: { taxableMinor?: number; taxMinor?: number } }).totals ?? {};
    return { taxableMinor: totals.taxableMinor ?? 0, taxMinor: totals.taxMinor ?? 0, hash: `hash-${s.referenceId}` };
  }
  async proceedToFile(ctx: Ctx, returnType: ReturnType, period: string) {
    this.gate('proceedToFile', ctx, period);
    void returnType;
    this.maybeLose('proceedToFile');
    return { referenceId: `PTF${randomUUID().slice(0, 8).toUpperCase()}` };
  }
  async requestEvc(ctx: Ctx) {
    this.gate('requestEvc', ctx);
  }
  async file(ctx: Ctx, returnType: ReturnType, period: string, _pan: string, evcOtp: string) {
    this.gate('file', ctx, period);
    if (evcOtp !== ReturnsSimulator.OTP) throw new ReturnsError('PORTAL_REFUSED', 'Wrong EVC OTP', ['RT-EVC-01']);
    const key = `${ctx.gstin}|${returnType}|${period}`;
    if (this.filed.has(key)) throw new ReturnsError('PORTAL_REFUSED', 'Return already filed', ['RET191175']);
    const arn = `AA${ctx.gstin.slice(0, 2)}${period}${randomUUID().slice(0, 7).toUpperCase()}`;
    this.filed.set(key, { arn, filedOn: this.now().toISOString().slice(0, 10) });
    this.maybeLose('file');
    return { arn };
  }
  async trackReturns(ctx: Ctx, fy: string): Promise<TrackedReturn[]> {
    this.gate('trackReturns', ctx);
    void fy;
    return [...this.filed.entries()]
      .filter(([k]) => k.startsWith(`${ctx.gstin}|`))
      .map(([k, v]) => {
        const [, returnType, period] = k.split('|');
        return { returnType: returnType as ReturnType, period, status: 'filed' as const, arn: v.arn, filedOn: v.filedOn };
      });
  }
  async ledgers(ctx: Ctx, period: string) {
    this.gate('ledgers', ctx, period);
    return this.ledger;
  }
}

/** Returns not set up: every call says so, and the app keeps to preparing returns. */
export class DisabledReturns implements ReturnsProvider {
  readonly name = 'disabled';
  private no(): never {
    throw new ReturnsError('NOT_CONFIGURED', 'Filing through the GSP is not set up on this server');
  }
  requestOtp = async () => this.no();
  authenticate = async () => this.no();
  refresh = async () => this.no();
  getGstr2b = async () => this.no();
  save = async () => this.no();
  offset = async () => this.no();
  returnStatus = async () => this.no();
  summary = async () => this.no();
  proceedToFile = async () => this.no();
  requestEvc = async () => this.no();
  file = async () => this.no();
  trackReturns = async () => this.no();
  ledgers = async () => this.no();
}

export function createReturnsProvider(config: Config, now: () => Date = () => new Date()): ReturnsProvider {
  switch (config.RETURNS_PROVIDER) {
    case 'simulator':
      return new ReturnsSimulator(now);
    case 'gsp':
      return new AdaequareReturns(config);
    default:
      return new DisabledReturns();
  }
}
