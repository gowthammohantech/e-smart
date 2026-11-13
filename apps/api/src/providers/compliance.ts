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
import { createGspRouter } from './gsp';
import type { GspGatewayName } from './gsp/provider-name';

/** What `saveComplianceCredentials` stored, decrypted for the length of one call. */
export type PortalCredentials = {
  gspProvider?: string;
  /**
   * The gateway a platform operator chose for this company. Unset follows the deployment's default,
   * which is what every company did before the choice existed.
   */
  gspGateway?: GspGatewayName;
  /** The seller's GSTIN; the IRP and EWB APIs scope every call to it. */
  gstin: string;
  username: string;
  password: string;
};

type Failure = { ok: false; errors: ComplianceIssue[] };

export type SubmitInvoiceResult = { ok: true; irn: string; ackNo: string; ackDate: string; signedQrPayload: string } | Failure;
export type CancelIrnResult = { ok: true; cancelDate: string; reason: string } | Failure;
export type SubmitEwayBillResult = { ok: true; ewayBillNumber: string; generatedAt: string; validFrom: string; validUpto: string } | Failure;
export type UpdatePartBResult = { ok: true; updatedAt: string } | Failure;
export type ExtendResult = { ok: true; newValidUpto: string } | Failure;
export type CancelEwayBillResult = { ok: true; cancelledAt: string; reason: string } | Failure;
/** A bill the portal has for a document, or null when it has none. */
export type FindEwayBillResult = { ok: true; found: Extract<SubmitEwayBillResult, { ok: true }> | null } | Failure;
export type IrnStatusResult = { ok: true; status: 'active' | 'cancelled'; cancelDate?: string } | Failure;
/** What a lost answer looks like: no answer at all. The call may or may not have reached the portal. */
export const isUnanswered = (r: { ok: boolean; errors?: { code: string }[] }) => !r.ok && !!r.errors?.some((e) => e.code === 'GSP_UNAVAILABLE');
/** A gateway that has no such call (Whitebooks cannot look a bill or an IRN up): the same as the method being absent. */
export const isUnsupported = (r: { ok: boolean; errors?: { code: string }[] }) => !r.ok && !!r.errors?.some((e) => e.code === 'GSP_UNSUPPORTED');
/**
 * The e-invoice (IRP) and e-way bill portals take separate logins, which need not match. Each call that
 * reaches a portal gets the login for that portal; a connection test gets both.
 */
export type PortalLogins = { einvoice: PortalCredentials | null; ewaybill: PortalCredentials | null };

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
  /** `irp` is checked with the e-invoice login, `ewb` with the e-way bill login. */
  testConnection(logins: PortalLogins): Promise<ConnectionResult>;
  submitInvoice(creds: PortalCredentials | null, req: { companyId?: string; payload: IrpInvoicePayload; existingIrns: string[]; now: string }): Promise<SubmitInvoiceResult>;
  cancelIrn(creds: PortalCredentials | null, req: { irn: string; irnGeneratedAt: string; reasonCode: CancelReasonCode; remark?: string; now: string }): Promise<CancelIrnResult>;
  /**
   * `irn` is the document's live IRN, when it has one: a GSP then raises the bill
   * against it with Part B alone, since NIC already holds the document.
   */
  submitEwayBill(creds: PortalCredentials | null, req: { companyId?: string; payload: EwbPayload; vehicleType: VehicleType; now: string; irn?: string }): Promise<SubmitEwayBillResult>;
  updatePartB(creds: PortalCredentials | null, req: PartBUpdateRequest): Promise<UpdatePartBResult>;
  extend(
    creds: PortalCredentials | null,
    req: { bill: EwayBill; remainingDistanceKm: number; reasonCode: EwayExtendReasonCode; remark?: string; currentPlace: string; currentPincode: string; currentStateCode: string; transitType: 'inTransit' | 'inMovement'; now: string },
  ): Promise<ExtendResult>;
  cancelEwayBill(creds: PortalCredentials | null, req: { ewayBillNumber: string; reasonCode: CancelReasonCode; remark?: string; now: string }): Promise<CancelEwayBillResult>;
  /**
   * Recovery after a lost answer: the bill the portal raised for this document, if it raised one.
   * Optional: a gateway without the lookup leaves the attempt for a person to check on the portal.
   */
  findEwayBillByDocument?(creds: PortalCredentials | null, req: { docType: string; docNo: string; docDate: string; fromGstin: string; now: string }): Promise<FindEwayBillResult>;
  /** Recovery after a cancel whose answer was lost: whether the IRN is still active. */
  getIrnStatus?(creds: PortalCredentials | null, req: { irn: string; now: string }): Promise<IrnStatusResult>;
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
  /** Operations whose next call goes through at the "portal" but whose answer never arrives. */
  private readonly lost = new Set<PortalOperation>();
  /** What the "portal" holds, for the recovery lookups. */
  private readonly bills = new Map<string, Extract<SubmitEwayBillResult, { ok: true }>>();
  private readonly cancelledIrns = new Map<string, string>();

  /** The next call of `operation` takes effect, but the caller sees GSP_UNAVAILABLE, as on a timeout. */
  loseNext(operation: PortalOperation) {
    this.lost.add(operation);
  }

  private unanswered<T extends { ok: boolean }>(operation: PortalOperation, result: T): T | Failure {
    if (!this.lost.delete(operation)) return result;
    return { ok: false, errors: [{ code: 'GSP_UNAVAILABLE', field: 'document', message: 'No answer from the portal (simulated)', severity: 'blocking' }] } as Failure;
  }

  failNext(operation: PortalOperation, code: IrpErrorCode, message?: string) {
    const queue = this.faults.get(operation) ?? [];
    queue.push({ fail: code, message });
    this.faults.set(operation, queue);
  }

  clearFaults() {
    this.faults.clear();
  }

  /** Forget everything, as a fresh portal: faults, lost answers and what it holds. */
  reset() {
    this.faults.clear();
    this.lost.clear();
    this.bills.clear();
    this.cancelledIrns.clear();
  }

  private fault(operation: PortalOperation): IrpSimulation | undefined {
    return this.faults.get(operation)?.shift();
  }

  private rejected(sim: IrpSimulation): Failure {
    const code = sim.fail!;
    return { ok: false, errors: [{ code, field: 'document', message: sim.message ?? IRP_ERRORS[code], severity: 'blocking' }] };
  }

  async testConnection(logins: PortalLogins): Promise<ConnectionResult> {
    const sim = this.fault('testConnection');
    if (sim) {
      const message = sim.message ?? IRP_ERRORS[sim.fail!];
      return { irp: { ok: false, message }, ewb: { ok: false, message } };
    }
    const check = (creds: PortalCredentials | null, portal: string) =>
      creds
        ? { ok: true, message: `Authenticated as ${creds.username} on the simulated ${portal} portal` }
        : { ok: false, message: `No ${portal} credentials are stored yet` };
    return { irp: check(logins.einvoice, 'e-invoice'), ewb: check(logins.ewaybill, 'e-way bill') };
  }

  async submitInvoice(_creds: PortalCredentials | null, req: { payload: IrpInvoicePayload; existingIrns: string[]; now: string }) {
    return simulateSubmitInvoice({ ...req, simulation: this.fault('submitInvoice') });
  }

  async cancelIrn(_creds: PortalCredentials | null, req: Parameters<ComplianceProvider['cancelIrn']>[1]) {
    const result = simulateCancelIrn({ ...req, simulation: this.fault('cancelIrn') });
    if (result.ok) this.cancelledIrns.set(req.irn, result.cancelDate);
    return this.unanswered('cancelIrn', result);
  }

  async submitEwayBill(_creds: PortalCredentials | null, req: { payload: EwbPayload; vehicleType: VehicleType; now: string }) {
    const result = simulateSubmitEwayBill({ ...req, simulation: this.fault('submitEwayBill') });
    if (result.ok) this.bills.set(billKey(req.payload), result);
    return this.unanswered('submitEwayBill', result);
  }

  async findEwayBillByDocument(_creds: PortalCredentials | null, req: { docType: string; docNo: string; docDate: string; fromGstin: string }): Promise<FindEwayBillResult> {
    return { ok: true, found: this.bills.get(billKey(req)) ?? null };
  }

  async getIrnStatus(_creds: PortalCredentials | null, req: { irn: string }): Promise<IrnStatusResult> {
    const cancelDate = this.cancelledIrns.get(req.irn);
    return cancelDate ? { ok: true, status: 'cancelled', cancelDate } : { ok: true, status: 'active' };
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

/** A document's identity at the e-way bill portal: who raised it, and its type, number and date. */
const billKey = (d: { docType: string; docNo: string; docDate: string; fromGstin: string }) => `${d.fromGstin}|${d.docType}|${d.docNo}|${d.docDate}`;

// ------------------------------------------------------------------ GSP

/**
 * The real portals, through a GST Suvidha Provider: Adaequare (production-ready)
 * or Whitebooks (sandbox only). A company follows `TAXATION_GSP_PROVIDER_CODE` unless a platform
 * operator chose a gateway for it; see `providers/gsp/` for the gateways and the README there for the environment.
 */
export function createComplianceProvider(config: Config): ComplianceProvider {
  if (config.COMPLIANCE_PROVIDER === 'gsp') return createGspRouter(config);
  return new SimulatedComplianceProvider();
}
