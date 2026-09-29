import type { ComplianceIssue, EwayBill, EwayExtendReasonCode, VehicleType, CancelReasonCode } from '@esmart/core/types';
import type { IrpInvoicePayload } from '@esmart/core/domain/eInvoice';
import { EWAY_PART_B_REASONS, type EwbPayload } from '@esmart/core/domain/ewayBill';
import {
  IRP_ERRORS,
  cancelEwayBillAtPortal,
  cancelIrn as simulateCancelIrn,
  extendEwayBillAtPortal,
  submitEwayBill as simulateSubmitEwayBill,
  submitInvoice as simulateSubmitInvoice,
  type IrpErrorCode,
  type IrpSimulation,
} from '@esmart/core/domain/irpAdapter';
import type { Config } from '../config';

/** What `saveComplianceCredentials` stored, decrypted for the length of one call. */
export type PortalCredentials = {
  environment: 'sandbox' | 'production';
  gspProvider?: string;
  /** The seller's GSTIN; the IRP and EWB APIs scope every call to it. */
  gstin: string;
  username: string;
  password: string;
  clientId?: string;
  clientSecret?: string;
};

type Failure = { ok: false; errors: ComplianceIssue[] };

export type SubmitInvoiceResult = { ok: true; irn: string; ackNo: string; ackDate: string; signedQrPayload: string } | Failure;
export type CancelIrnResult = { ok: true; cancelDate: string; reason: string } | Failure;
export type SubmitEwayBillResult = { ok: true; ewayBillNumber: string; generatedAt: string; validFrom: string; validUpto: string } | Failure;
export type UpdatePartBResult = { ok: true; updatedAt: string } | Failure;
export type ExtendResult = { ok: true; newValidUpto: string } | Failure;
export type CancelEwayBillResult = { ok: true; cancelledAt: string; reason: string } | Failure;
export type ConnectionResult = { irp: { ok: boolean; message: string }; ewb: { ok: boolean; message: string } };

export type PartBUpdateRequest = {
  ewayBillNumber: string;
  mode: 'road' | 'rail' | 'air' | 'ship';
  vehicleNumber?: string;
  vehicleType: VehicleType;
  transportDocNumber?: string;
  transportDocDate?: string;
  fromPlace: string;
  fromStateCode: string;
  reasonCode: keyof typeof EWAY_PART_B_REASONS;
  remark?: string;
  now: string;
};

/**
 * GST e-invoice (IRP) and e-way bill (EWB) portals. Every call is one portal
 * round trip; the rules (applicability, validation, windows) are applied by
 * the caller with `@esmart/core` before it gets here. A portal rejection comes
 * back as `{ ok: false, errors }` with the NIC code in `errors[].code`, never
 * as a throw, so the caller can record the attempt.
 *
 * Each call takes the company's decrypted credentials (null when none are
 * stored); the simulator ignores them.
 */
export interface ComplianceProvider {
  readonly name: 'simulator' | 'gsp';
  testConnection(creds: PortalCredentials | null): Promise<ConnectionResult>;
  submitInvoice(creds: PortalCredentials | null, req: { payload: IrpInvoicePayload; existingIrns: string[]; now: string }): Promise<SubmitInvoiceResult>;
  cancelIrn(creds: PortalCredentials | null, req: { irn: string; irnGeneratedAt: string; reasonCode: CancelReasonCode; remark?: string; now: string }): Promise<CancelIrnResult>;
  submitEwayBill(creds: PortalCredentials | null, req: { payload: EwbPayload; vehicleType: VehicleType; now: string }): Promise<SubmitEwayBillResult>;
  updatePartB(creds: PortalCredentials | null, req: PartBUpdateRequest): Promise<UpdatePartBResult>;
  extend(
    creds: PortalCredentials | null,
    req: { bill: EwayBill; remainingDistanceKm: number; reasonCode: EwayExtendReasonCode; remark?: string; currentPlace: string; currentPincode: string; currentStateCode: string; transitType: 'inTransit' | 'inMovement'; now: string },
  ): Promise<ExtendResult>;
  cancelEwayBill(creds: PortalCredentials | null, req: { ewayBillNumber: string; reasonCode: CancelReasonCode; remark?: string; now: string }): Promise<CancelEwayBillResult>;
}

export type PortalOperation = Exclude<keyof ComplianceProvider, 'name'>;

/**
 * In-process portals: core's `irpAdapter`, which computes the real IRN,
 * acknowledgement, signed QR, e-way bill number and validity from the
 * request and the `now` it is given. Deterministic, so tests pin the results.
 *
 * `failNext` queues a portal rejection for the next call of an operation,
 * which is how tests (and a sandbox demo) reach the rejection path.
 */
export class SimulatedComplianceProvider implements ComplianceProvider {
  readonly name = 'simulator' as const;
  private readonly faults = new Map<PortalOperation, IrpSimulation[]>();

  failNext(operation: PortalOperation, code: IrpErrorCode, message?: string) {
    const queue = this.faults.get(operation) ?? [];
    queue.push({ fail: code, message });
    this.faults.set(operation, queue);
  }

  clearFaults() {
    this.faults.clear();
  }

  private fault(operation: PortalOperation): IrpSimulation | undefined {
    return this.faults.get(operation)?.shift();
  }

  private rejected(sim: IrpSimulation): Failure {
    const code = sim.fail!;
    return { ok: false, errors: [{ code, field: 'document', message: sim.message ?? IRP_ERRORS[code], severity: 'blocking' }] };
  }

  async testConnection(creds: PortalCredentials | null): Promise<ConnectionResult> {
    const sim = this.fault('testConnection');
    if (sim) {
      const message = sim.message ?? IRP_ERRORS[sim.fail!];
      return { irp: { ok: false, message }, ewb: { ok: false, message } };
    }
    if (!creds) {
      const message = 'No portal credentials are stored yet';
      return { irp: { ok: false, message }, ewb: { ok: false, message } };
    }
    const message = `Authenticated as ${creds.username} on the simulated ${creds.environment} portal`;
    return { irp: { ok: true, message }, ewb: { ok: true, message } };
  }

  async submitInvoice(_creds: PortalCredentials | null, req: { payload: IrpInvoicePayload; existingIrns: string[]; now: string }) {
    return simulateSubmitInvoice({ ...req, simulation: this.fault('submitInvoice') });
  }

  async cancelIrn(_creds: PortalCredentials | null, req: Parameters<ComplianceProvider['cancelIrn']>[1]) {
    return simulateCancelIrn({ ...req, simulation: this.fault('cancelIrn') });
  }

  async submitEwayBill(_creds: PortalCredentials | null, req: { payload: EwbPayload; vehicleType: VehicleType; now: string }) {
    return simulateSubmitEwayBill({ ...req, simulation: this.fault('submitEwayBill') });
  }

  async updatePartB(_creds: PortalCredentials | null, req: PartBUpdateRequest): Promise<UpdatePartBResult> {
    const sim = this.fault('updatePartB');
    if (sim) return this.rejected(sim);
    return { ok: true, updatedAt: req.now };
  }

  async extend(_creds: PortalCredentials | null, req: Parameters<ComplianceProvider['extend']>[1]) {
    return extendEwayBillAtPortal({ bill: req.bill, remainingDistanceKm: req.remainingDistanceKm, reasonCode: req.reasonCode, now: req.now, simulation: this.fault('extend') });
  }

  async cancelEwayBill(_creds: PortalCredentials | null, req: Parameters<ComplianceProvider['cancelEwayBill']>[1]) {
    return cancelEwayBillAtPortal({ ...req, simulation: this.fault('cancelEwayBill') });
  }
}

// ------------------------------------------------------------------ GSP

type GspError = { ErrorCode?: string; ErrorMessage?: string };
type GspEnvelope<T> = { Status?: number | string; Data?: T; ErrorDetails?: GspError[]; InfoDtls?: { InfCd?: string; Desc?: T }[] };

/**
 * NIC answers in IST as `dd/MM/yyyy hh:mm:ss AM` (EWB) or `yyyy-MM-dd HH:mm:ss`
 * (IRP); the rest of the server wants ISO instants.
 */
export function isoFromPortal(value: string): string {
  const ewb = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2})(?: ?([AP]M))?$/i.exec(value.trim());
  const irp = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(value.trim());
  let parts: number[];
  if (ewb) {
    let h = Number(ewb[4]);
    const half = ewb[7]?.toUpperCase();
    if (half === 'PM' && h < 12) h += 12;
    if (half === 'AM' && h === 12) h = 0;
    parts = [Number(ewb[3]), Number(ewb[2]), Number(ewb[1]), h, Number(ewb[5]), Number(ewb[6])];
  } else if (irp) {
    parts = irp.slice(1).map(Number);
  } else {
    return new Date(value).toISOString();
  }
  const [y, mo, d, h, mi, s] = parts;
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s) - 330 * 60_000).toISOString();
}

const unreachable = (message: string): Failure => ({ ok: false, errors: [{ code: 'SIM001', field: 'document', message, severity: 'blocking' }] });
const toIssues = (errors: GspError[] | undefined): ComplianceIssue[] =>
  (errors?.length ? errors : [{ ErrorMessage: 'The portal rejected the request' }]).map((e) => ({ code: e.ErrorCode ?? 'GSP', field: 'document', message: e.ErrorMessage ?? 'Rejected', severity: 'blocking' as const }));

/**
 * The same interface against a GST Suvidha Provider (ClearTax, Masters India,
 * IRIS, …) at `GSP_BASE_URL`. A skeleton: GSPs agree on NIC's JSON bodies
 * (schema 1.1 for the IRP, the EWB API's field names) and on the
 * `{ Status, Data, ErrorDetails }` envelope, but not on URLs or auth, so the
 * paths below follow NIC's own and need mapping per vendor.
 *
 * What a real adapter needs:
 * - The ASP's own client id and secret from the GSP (per deployment, not per
 *   company), sent as headers on every call, plus an IP allow-listing.
 * - Per company: the GSTIN and the API username and password created on the
 *   IRP/EWB portal for that GSP (these are what `saveComplianceCredentials`
 *   stores), used to obtain an auth token that lasts about six hours; cache
 *   it in `compliance_credentials.auth_token_encrypted`.
 * - With NIC direct access (no GSP): RSA-encrypt the password and a random
 *   AppKey with NIC's public key, then AES-encrypt every payload with the
 *   session key (SEK) the auth call returns. Most GSPs hide this.
 * - Handling 2150 (duplicate IRN): the IRP returns the existing IRN, ack number
 *   and date in `InfoDtls`; treat that as success.
 * - Timeouts and retries: IRP calls are not idempotent on the portal side, so
 *   after a timeout fetch by document (GetIRNByDocDetails) before resubmitting.
 */
export class GspComplianceProvider implements ComplianceProvider {
  readonly name = 'gsp' as const;
  constructor(private readonly baseUrl: string) {}

  private async call<T>(creds: PortalCredentials | null, path: string, body: unknown): Promise<{ ok: true; data: T } | Failure> {
    if (!creds) return { ok: false, errors: [{ code: 'AUTH', field: 'credentials', message: 'Store the portal credentials first', severity: 'blocking' }] };
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl.replace(/\/+$/, '')}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          gstin: creds.gstin,
          user_name: creds.username,
          password: creds.password,
          ...(creds.clientId ? { client_id: creds.clientId } : {}),
          ...(creds.clientSecret ? { client_secret: creds.clientSecret } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      return unreachable(`The portal is not reachable: ${(err as Error).message}`);
    }
    let json: GspEnvelope<T>;
    try {
      json = (await res.json()) as GspEnvelope<T>;
    } catch {
      return unreachable(`The portal answered ${res.status} without JSON`);
    }
    if (!res.ok || String(json.Status) !== '1' || json.Data === undefined) return { ok: false, errors: toIssues(json.ErrorDetails) };
    return { ok: true, data: json.Data };
  }

  async testConnection(creds: PortalCredentials | null): Promise<ConnectionResult> {
    const irp = await this.call<unknown>(creds, '/eivital/v1.04/auth', {});
    const ewb = await this.call<unknown>(creds, '/ewaybillapi/v1.03/auth', {});
    const said = (r: typeof irp) => (r.ok ? { ok: true, message: 'Authenticated' } : { ok: false, message: r.errors[0]?.message ?? 'Failed' });
    return { irp: said(irp), ewb: said(ewb) };
  }

  async submitInvoice(creds: PortalCredentials | null, req: { payload: IrpInvoicePayload }): Promise<SubmitInvoiceResult> {
    const r = await this.call<{ Irn: string; AckNo: number | string; AckDt: string; SignedQRCode: string }>(creds, '/eicore/v1.03/Invoice', req.payload);
    if (!r.ok) return r;
    return { ok: true, irn: r.data.Irn, ackNo: String(r.data.AckNo), ackDate: r.data.AckDt, signedQrPayload: r.data.SignedQRCode };
  }

  async cancelIrn(creds: PortalCredentials | null, req: { irn: string; reasonCode: CancelReasonCode; remark?: string }): Promise<CancelIrnResult> {
    const r = await this.call<{ CancelDate: string }>(creds, '/eicore/v1.03/Invoice/Cancel', { Irn: req.irn, CnlRsn: req.reasonCode, CnlRem: req.remark ?? '' });
    return r.ok ? { ok: true, cancelDate: r.data.CancelDate, reason: req.reasonCode } : r;
  }

  async submitEwayBill(creds: PortalCredentials | null, req: { payload: EwbPayload }): Promise<SubmitEwayBillResult> {
    const r = await this.call<{ ewayBillNo: number | string; ewayBillDate: string; validUpto: string }>(creds, '/ewaybillapi/v1.03/ewayapi/GENEWAYBILL', req.payload);
    if (!r.ok) return r;
    return { ok: true, ewayBillNumber: String(r.data.ewayBillNo), generatedAt: isoFromPortal(r.data.ewayBillDate), validFrom: isoFromPortal(r.data.ewayBillDate), validUpto: isoFromPortal(r.data.validUpto) };
  }

  async updatePartB(creds: PortalCredentials | null, req: PartBUpdateRequest): Promise<UpdatePartBResult> {
    const r = await this.call<{ vehUpdDate: string }>(creds, '/ewaybillapi/v1.03/ewayapi/VEHEWB', {
      ewbNo: Number(req.ewayBillNumber),
      vehicleNo: req.vehicleNumber,
      fromPlace: req.fromPlace,
      fromState: Number(req.fromStateCode),
      reasonCode: req.reasonCode,
      reasonRem: req.remark ?? '',
      transDocNo: req.transportDocNumber,
      transDocDate: req.transportDocDate,
      transMode: req.mode,
      vehicleType: req.vehicleType === 'overDimensional' ? 'O' : 'R',
    });
    return r.ok ? { ok: true, updatedAt: isoFromPortal(r.data.vehUpdDate) } : r;
  }

  async extend(creds: PortalCredentials | null, req: Parameters<ComplianceProvider['extend']>[1]): Promise<ExtendResult> {
    const r = await this.call<{ validUpto: string }>(creds, '/ewaybillapi/v1.03/ewayapi/EXTENDVALIDITY', {
      ewbNo: Number(req.bill.ewayBillNumber),
      vehicleNo: req.bill.vehicleNumber,
      fromPlace: req.currentPlace,
      fromPincode: Number(req.currentPincode),
      fromState: Number(req.currentStateCode),
      remainingDistance: req.remainingDistanceKm,
      extnRsnCode: Number(req.reasonCode),
      extnRemarks: req.remark ?? '',
      consignmentStatus: req.transitType === 'inTransit' ? 'T' : 'M',
    });
    return r.ok ? { ok: true, newValidUpto: isoFromPortal(r.data.validUpto) } : r;
  }

  async cancelEwayBill(creds: PortalCredentials | null, req: { ewayBillNumber: string; reasonCode: CancelReasonCode; remark?: string }): Promise<CancelEwayBillResult> {
    const r = await this.call<{ cancelDate: string }>(creds, '/ewaybillapi/v1.03/ewayapi/CANEWB', { ewbNo: Number(req.ewayBillNumber), cancelRsnCode: Number(req.reasonCode), cancelRmrk: req.remark ?? '' });
    return r.ok ? { ok: true, cancelledAt: isoFromPortal(r.data.cancelDate), reason: req.reasonCode } : r;
  }
}

export function createComplianceProvider(config: Config): ComplianceProvider {
  if (config.COMPLIANCE_PROVIDER === 'gsp') {
    if (!config.GSP_BASE_URL) throw new Error('COMPLIANCE_PROVIDER=gsp needs GSP_BASE_URL.');
    return new GspComplianceProvider(config.GSP_BASE_URL);
  }
  return new SimulatedComplianceProvider();
}
