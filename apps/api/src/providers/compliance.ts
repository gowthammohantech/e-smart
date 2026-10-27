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
import { createGspGateway } from './gsp';

/** What `saveComplianceCredentials` stored, decrypted for the length of one call. */
export type PortalCredentials = {
  gspProvider?: string;
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
  submitInvoice(creds: PortalCredentials | null, req: { payload: IrpInvoicePayload; existingIrns: string[]; now: string }): Promise<SubmitInvoiceResult>;
  cancelIrn(creds: PortalCredentials | null, req: { irn: string; irnGeneratedAt: string; reasonCode: CancelReasonCode; remark?: string; now: string }): Promise<CancelIrnResult>;
  /**
   * `irn` is the document's live IRN, when it has one: a GSP then raises the bill
   * against it with Part B alone, since NIC already holds the document.
   */
  submitEwayBill(creds: PortalCredentials | null, req: { payload: EwbPayload; vehicleType: VehicleType; now: string; irn?: string }): Promise<SubmitEwayBillResult>;
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

/**
 * The real portals, through a GST Suvidha Provider: Adaequare (production-ready)
 * or Whitebooks (sandbox only). Which one is `TAXATION_GSP_PROVIDER_CODE`; see
 * `providers/gsp/` for the gateways and the README there for the environment.
 */
export function createComplianceProvider(config: Config): ComplianceProvider {
  if (config.COMPLIANCE_PROVIDER === 'gsp') return createGspGateway(config);
  return new SimulatedComplianceProvider();
}
