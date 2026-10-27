import type { ComplianceIssue, EwayBill, EwayExtendReasonCode, TransportMode } from '@esmart/core/types';
import type { IrpInvoicePayload } from '@esmart/core/domain/eInvoice';
import { portalDate } from '@esmart/core/domain/eInvoice';
import { validUptoFor, type EwbPayload } from '@esmart/core/domain/ewayBill';
import { whitebooksSettings, type Config } from '../../config';
import type { ComplianceProvider, PartBUpdateRequest, PortalCredentials } from '../compliance';
import { asCode, nicErrorsOf, parsePortalDateAny, toPortalDateTime } from './envelope';
import type { GspGatewayName } from './provider-name';
import { GspAuthError, GspConfigError, GspRequestError } from './transport';

/** A GSP-backed `ComplianceProvider`, which can also answer the GST public search. */
export interface GspGateway extends ComplianceProvider {
  readonly gateway: GspGatewayName;
  /** The register's record for a GSTIN as received, or null when it holds no such registration. */
  lookupTaxpayer(gstin: string): Promise<Record<string, unknown> | null>;
}

export type Failure = { ok: false; errors: ComplianceIssue[] };

export const failure = (code: string, message: string, field = 'document'): Failure => ({
  ok: false,
  errors: [{ code, field, message, severity: 'blocking' }],
});

/**
 * A GSP problem as the `{ ok: false, errors }` result the callers record. The
 * portal's own codes and wording go through: they name the field far better
 * than anything generic. Anything that is not a GSP problem is a bug and throws.
 */
export function failureFrom(err: unknown, log: (message: string) => void = () => {}): Failure {
  if (err instanceof GspRequestError) {
    if (err.isUnavailable) return failure('GSP_UNAVAILABLE', `The GST gateway is unavailable: ${err.message}`);
    const issues = nicErrorsOf(err.envelope).map<ComplianceIssue>((e) => ({
      code: e.code ?? 'PORTAL',
      field: 'document',
      message: e.text || e.code || err.message,
      severity: 'blocking',
    }));
    return issues.length ? { ok: false, errors: issues } : failure(asCode(err.envelope?.errorCode) ?? 'PORTAL', err.message);
  }
  if (err instanceof GspAuthError) {
    log(`GSP authentication failed: ${err.message}`);
    // Our credentials were refused, not the caller's, and the gateway's wording can name the account.
    return failure('GSP_AUTH', 'The GST gateway refused this application’s credentials.', 'credentials');
  }
  if (err instanceof GspConfigError) return failure('GSP_NOT_CONFIGURED', err.message, 'credentials');
  throw err;
}

/** The per-company portal login, or the failure that says to store it. */
export function requireLogin(creds: PortalCredentials | null): PortalCredentials {
  if (!creds) throw new GspConfigError('Store the portal credentials first');
  if (!creds.gstin || !creds.username || !creds.password) {
    throw new GspConfigError('The portal credentials need the company GSTIN, the portal username and its password');
  }
  return creds;
}

export function baseUrlOf(baseUrl: string | undefined): string {
  if (!baseUrl) throw new GspConfigError('The GSP base URL is not set (TAXATION_ADAEQUARE_BASE_URL or TAXATION_WHITEBOOKS_BASE_URL)');
  return baseUrl;
}

/** Whitebooks' two account-level settings; a missing one is configuration, so it names the variable. */
export function whitebooksAccount(config: Config): { email: string; ipAddress: string } {
  const { email, ipAddress } = whitebooksSettings(config);
  if (!email) throw new GspConfigError('Whitebooks requires an account email — set TAXATION_WHITEBOOKS_ACCOUNT_EMAIL.');
  if (!ipAddress) throw new GspConfigError('Whitebooks requires the registered IP address — set TAXATION_WHITEBOOKS_IP_ADDRESS.');
  return { email, ipAddress };
}

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

/** Empty strings are rejected by the portal; the key must be omitted instead. */
function dropBlank<T>(value: T): T {
  if (Array.isArray(value)) return value.map(dropBlank) as unknown as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === ''))
        .map(([k, v]) => [k, dropBlank(v)]),
    ) as T;
  }
  return value;
}

/**
 * The core payload (NIC schema 1.1) as the portal wants it on the wire:
 * blanks omitted, and **all four cess fields sent even at zero** — the portal
 * sums every one of them against `TotItemVal`, and omitting them is what
 * error 2194 complains about.
 */
export function prepareIrnPayload(payload: IrpInvoicePayload): Record<string, unknown> {
  const zeroCess = { CesRt: 0, CesAmt: 0, CesNonAdvlAmt: 0, StateCesRt: 0, StateCesAmt: 0, StateCesNonAdvlAmt: 0, OthChrg: 0 };
  return dropBlank({
    ...payload,
    ItemList: payload.ItemList.map((item) => ({ ...zeroCess, ...item })),
    ValDtls: { CesVal: 0, StCesVal: 0, ...payload.ValDtls },
  });
}

/** `dd/MM/yyyy`, whether the caller held an ISO date or already the portal's spelling. */
export function toDdMmYyyy(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? portalDate(value) : value;
}

const whole = (n: number) => Math.round(n);

/** Part B of an e-way bill by IRN — the IRN and how the goods travel, never the document. */
export function ewayBillByIrnBody(irn: string, payload: EwbPayload, docNoKey: 'TrnDocNO' | 'TransDocNo', docDtKey: 'TrnDocDt' | 'TransDocDt'): Record<string, unknown> {
  return dropBlank({
    Irn: irn,
    TransId: payload.transporterId,
    TransName: payload.transporterName,
    TransMode: payload.transMode,
    [docNoKey]: payload.transDocNo,
    [docDtKey]: toDdMmYyyy(payload.transDocDate),
    VehNo: payload.vehicleNo,
    VehType: payload.vehicleType,
    // A whole integer: the portal rejects a decimal distance rather than truncating it.
    Distance: whole(payload.transDistance),
  });
}

/**
 * NIC's native GENEWAYBILL body. The e-way bill keeps only its main HSN and
 * totals, not its lines, so the item list is one line summarising them, with
 * the rates derived from the tax amounts.
 */
export function nativeEwayBillBody(payload: EwbPayload): Record<string, unknown> {
  const rate = (tax: number) => (payload.totalValue > 0 ? Math.round((tax / payload.totalValue) * 10_000) / 100 : 0);
  return dropBlank({
    supplyType: payload.supplyType,
    subSupplyType: payload.subSupplyType,
    subSupplyDesc: payload.subSupplyDesc,
    docType: payload.docType,
    docNo: payload.docNo,
    docDate: toDdMmYyyy(payload.docDate),
    transactionType: payload.transactionType,
    fromGstin: payload.fromGstin,
    fromTrdName: payload.fromTrdName,
    fromAddr1: payload.fromAddr1,
    fromAddr2: payload.fromAddr2,
    fromPlace: payload.fromPlace,
    fromPincode: payload.fromPincode,
    actFromStateCode: Number(payload.fromStateCode),
    fromStateCode: Number(payload.fromStateCode),
    toGstin: payload.toGstin,
    toTrdName: payload.toTrdName,
    toAddr1: payload.toAddr1,
    toAddr2: payload.toAddr2,
    toPlace: payload.toPlace,
    toPincode: payload.toPincode,
    actToStateCode: Number(payload.toStateCode),
    toStateCode: Number(payload.toStateCode),
    totalValue: payload.totalValue,
    cgstValue: payload.cgstValue,
    sgstValue: payload.sgstValue,
    igstValue: payload.igstValue,
    cessValue: 0,
    cessNonAdvolValue: 0,
    otherValue: 0,
    totInvValue: payload.totInvValue,
    transporterId: payload.transporterId,
    transporterName: payload.transporterName,
    transDocNo: payload.transDocNo,
    transDocDate: toDdMmYyyy(payload.transDocDate),
    transMode: payload.transMode,
    transDistance: String(whole(payload.transDistance)),
    vehicleNo: payload.vehicleNo,
    vehicleType: payload.vehicleType,
    mainHsnCode: payload.mainHsnCode ? Number(payload.mainHsnCode) : undefined,
    itemList: [
      {
        productName: 'Goods',
        productDesc: payload.subSupplyDesc || 'Goods',
        hsnCode: payload.mainHsnCode ? Number(payload.mainHsnCode) : undefined,
        quantity: payload.itemCount || 1,
        qtyUnit: 'OTH',
        taxableAmount: payload.totalValue,
        sgstRate: rate(payload.sgstValue),
        cgstRate: rate(payload.cgstValue),
        igstRate: rate(payload.igstValue),
        cessRate: 0,
      },
    ],
  });
}

const TRANSPORT_MODE_CODE: Record<PartBUpdateRequest['mode'], string> = { road: '1', rail: '2', air: '3', ship: '4' };

/**
 * NIC's VEHEWB reason codes are not the app's: NIC numbers them
 * 1 breakdown · 2 transhipment · 3 others · 4 first time. Passing the app's code
 * straight through would file "first time" as "breakdown" and be accepted.
 */
const PART_B_REASON_TO_NIC: Record<PartBUpdateRequest['reasonCode'], number> = { '1': 4, '2': 1, '3': 2, '4': 3 };

/** NIC's EXTENDVALIDITY codes: 1 calamity · 2 law and order · 4 transhipment · 5 accident · 99 other. */
const EXTEND_REASON_TO_NIC: Record<EwayExtendReasonCode, number> = { '1': 1, '2': 2, '3': 4, '4': 5, '5': 99 };

export function partBBody(req: PartBUpdateRequest): Record<string, unknown> {
  return dropBlank({
    ewbNo: Number(req.ewayBillNumber),
    vehicleNo: req.vehicleNumber,
    fromPlace: req.fromPlace,
    fromState: Number(req.fromStateCode),
    reasonCode: PART_B_REASON_TO_NIC[req.reasonCode],
    reasonRem: req.remark ?? '',
    transDocNo: req.transportDocNumber,
    transDocDate: toDdMmYyyy(req.transportDocDate),
    transMode: TRANSPORT_MODE_CODE[req.mode],
    vehicleType: req.vehicleType === 'overDimensional' ? 'O' : 'R',
  });
}

export function extendBody(req: Parameters<ComplianceProvider['extend']>[1]): Record<string, unknown> {
  const bill: EwayBill = req.bill;
  return dropBlank({
    ewbNo: Number(bill.ewayBillNumber),
    vehicleNo: bill.vehicleNumber,
    fromPlace: req.currentPlace,
    fromState: Number(req.currentStateCode),
    fromPincode: Number(req.currentPincode),
    remainingDistance: whole(req.remainingDistanceKm),
    transMode: TRANSPORT_MODE_CODE[bill.transportMode as TransportMode],
    extnRsnCode: EXTEND_REASON_TO_NIC[req.reasonCode],
    extnRemarks: req.remark ?? '',
    consignmentStatus: req.transitType === 'inTransit' ? 'T' : 'M',
    // For a consignment in transit NIC also wants where it sits: R road, W warehouse, L lodging.
    transitType: req.transitType === 'inTransit' ? 'R' : undefined,
  });
}

export function cancelEwayBillBody(ewayBillNumber: string, reasonCode: string, remark?: string): Record<string, unknown> {
  // Numbers here, unlike the IRN cancellation's string `CnlRsn`. The app's e-way bill reasons
  // (2 order cancelled, 3 data entry mistake) already match NIC's, which swap the IRN's 2 and 3.
  return dropBlank({ ewbNo: Number(ewayBillNumber), cancelRsnCode: Number(reasonCode), cancelRmrk: remark });
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type IrnRecord = {
  Irn?: string;
  AckNo?: number | string;
  AckDt?: string;
  SignedInvoice?: string;
  SignedQRCode?: string;
};

export function acknowledgement(record: IrnRecord, now: string) {
  return {
    ok: true as const,
    irn: record.Irn as string,
    ackNo: record.AckNo === undefined || record.AckNo === null ? '' : String(record.AckNo),
    // `AckDt` is `yyyy-MM-dd HH:mm:ss` on IST; the column holds exactly that.
    ackDate: toPortalDateTime(parsePortalDateAny(record.AckDt) ?? new Date(now)),
    signedQrPayload: record.SignedQRCode ?? '',
  };
}

export type EwbRecord = {
  EwbNo?: number | string | null;
  EwbDt?: string;
  EwbValidTill?: string;
  ewayBillNo?: number | string | null;
  ewayBillDate?: string;
  validUpto?: string;
  ewbNo?: number | string | null;
};

/**
 * An issued e-way bill, with dates as ISO instants. The number is the part that
 * matters: a date the portal formatted unexpectedly falls back to the call's
 * own clock, and the validity to the same rule the portal applies.
 */
export function ewayBillResult(record: EwbRecord | null, req: { payload?: EwbPayload; vehicleType?: 'regular' | 'overDimensional'; now: string }) {
  const number = record?.EwbNo ?? record?.ewayBillNo ?? record?.ewbNo;
  if (number === undefined || number === null || number === '') return null;
  const generated = parsePortalDateAny(record?.EwbDt ?? record?.ewayBillDate) ?? new Date(req.now);
  const validUpto =
    parsePortalDateAny(record?.EwbValidTill ?? record?.validUpto) ??
    new Date(validUptoFor(generated.toISOString(), req.payload?.transDistance ?? 0, req.vehicleType ?? 'regular'));
  return {
    ok: true as const,
    ewayBillNumber: String(number),
    generatedAt: generated.toISOString(),
    validFrom: generated.toISOString(),
    validUpto: validUpto.toISOString(),
  };
}

export const incomplete = (what: string): Failure =>
  failure('GSP_INCOMPLETE', `The portal accepted the request but returned no ${what}. Check the portal before trying again.`);
