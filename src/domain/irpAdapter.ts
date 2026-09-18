import {
  CancelReasonCode,
  ComplianceIssue,
  EInvoiceDocType,
  EwayExtendReasonCode,
  VehicleType,
} from '@/types';
import { sha256Hex } from '@/lib/hash';
import {
  E_INVOICE_CANCEL_REASONS,
  IrpInvoicePayload,
  SignedQrClaims,
  buildSignedQrPayload,
  computeIrn,
  fiscalYearCode,
  portalDateTime,
} from './eInvoice';
import {
  EWAY_CANCEL_REASONS,
  EwbPayload,
  canExtendEwayBill,
  validUptoFor,
} from './ewayBill';

/**
 * A stand-in for the Invoice Registration Portal and the e-way bill portal
 * (FRD 16).
 *
 * This prototype has no server, so the network hop is simulated — but only the
 * hop. What comes back is computed by the real rules: the IRN is a genuine
 * SHA-256 digest, the acknowledgement number and the e-way bill number are
 * derived from it, and validity comes from the same `validUptoFor` the rest of
 * the app uses.
 *
 * Nothing in here reads the clock or reaches for a random number. Every source
 * of variation arrives as an argument, so the same request always produces the
 * same response, on any device and in any test.
 */

export type IrpErrorCode = '2150' | '2172' | '2176' | '2182' | '2211' | '3028' | '3029' | 'SIM001';

export const IRP_ERRORS: Record<IrpErrorCode, string> = {
  '2150': 'Duplicate IRN: this document has already been reported for the financial year',
  '2172': 'For an intra-state supply, CGST and SGST are applicable, not IGST',
  '2176': 'HSN code is mandatory on every line',
  '2182': 'The taxable value does not reconcile with the line values',
  '2211': 'The supplier GSTIN is not active on the portal',
  '3028': 'The supplier GSTIN is invalid',
  '3029': 'The buyer GSTIN is invalid',
  SIM001: 'The portal is not reachable. Try again in a moment.',
};

/** A fault injected from the sandbox, so the rejection path stays reachable. */
export type IrpSimulation = { fail?: IrpErrorCode; message?: string };

function portalIssue(code: IrpErrorCode, message?: string): ComplianceIssue {
  return { code, field: 'document', message: message ?? IRP_ERRORS[code], severity: 'blocking' };
}

/**
 * Derive a fixed-length run of digits from a hash.
 *
 * The portals issue opaque numeric identifiers. Deriving them from the hash of
 * the request keeps them stable for a given request — regenerate the demo data
 * and the same invoice gets the same acknowledgement number.
 */
function digitsFrom(seed: string, length: number): string {
  const hex = sha256Hex(seed);
  let out = '';
  for (let i = 0; out.length < length && i < hex.length; i += 1) {
    out += (parseInt(hex[i], 16) % 10).toString();
  }
  // A leading zero would be dropped by anything that reads these as numbers.
  if (out[0] === '0') out = `${(parseInt(hex[0], 16) % 9) + 1}${out.slice(1)}`;
  return out.slice(0, length);
}

/** The 16-digit acknowledgement number that accompanies an IRN. */
export function ackNoFrom(irn: string, now: string): string {
  return digitsFrom(`ack:${irn}:${now}`, 16);
}

/** The 12-digit number the e-way bill portal issues. */
export function ewayBillNumberFrom(seed: string): string {
  return digitsFrom(`ewb:${seed}`, 12);
}

/* ------------------------------------------------------------------ */
/* e-invoice                                                           */
/* ------------------------------------------------------------------ */

export type IrpInvoiceRequest = {
  payload: IrpInvoicePayload;
  /** Every IRN already issued in this company, for the duplicate check. */
  existingIrns: string[];
  now: string;
  simulation?: IrpSimulation;
};

export type IrpInvoiceResponse =
  | { ok: true; irn: string; ackNo: string; ackDate: string; signedQrPayload: string }
  | { ok: false; errors: ComplianceIssue[] };

export function submitInvoice(req: IrpInvoiceRequest): IrpInvoiceResponse {
  const { payload, existingIrns, now, simulation } = req;

  if (simulation?.fail) {
    return { ok: false, errors: [portalIssue(simulation.fail, simulation.message)] };
  }

  const gstin = payload.SellerDtls.Gstin;
  const docType = payload.DocDtls.Typ as EInvoiceDocType;
  const docNumber = payload.DocDtls.No;
  const [d, m, y] = payload.DocDtls.Dt.split('/');
  const fy = fiscalYearCode(`${y}-${m}-${d}`);

  const irn = computeIrn(gstin, docType, docNumber, fy);

  // The portal refuses a document number it has already registered this year,
  // including one whose IRN was later cancelled.
  if (existingIrns.includes(irn)) return { ok: false, errors: [portalIssue('2150')] };

  const ackNo = ackNoFrom(irn, now);
  const ackDate = portalDateTime(now);

  const claims: SignedQrClaims = {
    SellerGstin: gstin,
    DocNo: docNumber,
    DocTyp: docType,
    DocDt: payload.DocDtls.Dt,
    TotInvVal: payload.ValDtls.TotInvVal,
    ItemCnt: payload.ItemList.length,
    MainHsnCode: payload.ItemList.reduce<{ hsn?: string; value: number }>(
      (best, item) => (item.TotItemVal > best.value ? { hsn: item.HsnCd, value: item.TotItemVal } : best),
      { value: -1 },
    ).hsn,
    Irn: irn,
    IrnDt: ackDate,
  };
  if (payload.BuyerDtls.Gstin && payload.BuyerDtls.Gstin !== 'URP') {
    claims.BuyerGstin = payload.BuyerDtls.Gstin;
  }

  return { ok: true, irn, ackNo, ackDate, signedQrPayload: buildSignedQrPayload(claims) };
}

export type IrpCancelRequest = {
  irn: string;
  irnGeneratedAt: string;
  reasonCode: CancelReasonCode;
  remark?: string;
  now: string;
  simulation?: IrpSimulation;
};

export function cancelIrn(
  req: IrpCancelRequest,
): { ok: true; cancelDate: string; reason: string } | { ok: false; errors: ComplianceIssue[] } {
  if (req.simulation?.fail) {
    return { ok: false, errors: [portalIssue(req.simulation.fail, req.simulation.message)] };
  }
  return {
    ok: true,
    cancelDate: portalDateTime(req.now),
    reason: E_INVOICE_CANCEL_REASONS[req.reasonCode],
  };
}

/* ------------------------------------------------------------------ */
/* e-way bill                                                          */
/* ------------------------------------------------------------------ */

export type EwbSubmitRequest = {
  payload: EwbPayload;
  vehicleType: VehicleType;
  now: string;
  simulation?: IrpSimulation;
};

export type EwbSubmitResponse =
  | { ok: true; ewayBillNumber: string; generatedAt: string; validFrom: string; validUpto: string }
  | { ok: false; errors: ComplianceIssue[] };

export function submitEwayBill(req: EwbSubmitRequest): EwbSubmitResponse {
  const { payload, vehicleType, now, simulation } = req;

  if (simulation?.fail) {
    return { ok: false, errors: [portalIssue(simulation.fail, simulation.message)] };
  }

  const seed = `${payload.fromGstin}:${payload.docNo}:${payload.docDate}:${payload.vehicleNo ?? payload.transDocNo ?? ''}:${now}`;
  return {
    ok: true,
    ewayBillNumber: ewayBillNumberFrom(seed),
    generatedAt: now,
    validFrom: now,
    validUpto: validUptoFor(now, payload.transDistance, vehicleType),
  };
}

export type EwbCancelRequest = {
  ewayBillNumber: string;
  reasonCode: CancelReasonCode;
  remark?: string;
  now: string;
  simulation?: IrpSimulation;
};

export function cancelEwayBillAtPortal(
  req: EwbCancelRequest,
): { ok: true; cancelledAt: string; reason: string } | { ok: false; errors: ComplianceIssue[] } {
  if (req.simulation?.fail) {
    return { ok: false, errors: [portalIssue(req.simulation.fail, req.simulation.message)] };
  }
  return { ok: true, cancelledAt: req.now, reason: EWAY_CANCEL_REASONS[req.reasonCode] };
}

export type EwbExtendRequest = {
  bill: Parameters<typeof canExtendEwayBill>[0];
  remainingDistanceKm: number;
  reasonCode: EwayExtendReasonCode;
  now: string;
  simulation?: IrpSimulation;
};

export function extendEwayBillAtPortal(
  req: EwbExtendRequest,
): { ok: true; newValidUpto: string } | { ok: false; errors: ComplianceIssue[] } {
  if (req.simulation?.fail) {
    return { ok: false, errors: [portalIssue(req.simulation.fail, req.simulation.message)] };
  }

  const window = canExtendEwayBill(req.bill, req.now);
  if (!window.allowed) {
    return {
      ok: false,
      errors: [
        {
          code: 'EWB301',
          field: 'validUpto',
          message: window.reason ?? 'Outside the extension window',
          severity: 'blocking',
        },
      ],
    };
  }

  return {
    ok: true,
    newValidUpto: validUptoFor(req.now, req.remainingDistanceKm, req.bill.vehicleType),
  };
}
