import {
  BusinessDocument,
  CancelReasonCode,
  Company,
  ComplianceIssue,
  ComplianceSettings,
  DocumentKind,
  EwayBill,
  EwayBillStatus,
  EwayDocType,
  EwayExtendReasonCode,
  EwayPartBReasonCode,
  EwayPlace,
  EwaySubSupplyType,
  Item,
  TransportMode,
  VehicleType,
} from '@/types';
import { GSTIN_RE } from '@/lib/validators';
import { INDIAN_STATES } from '@/data/masters';

/**
 * E-way bills (FRD 16).
 *
 * The rules that matter here are the ones a business gets fined for: whether a
 * consignment needs a bill at all, how long that bill stays valid, and the two
 * narrow windows in which it can be cancelled or extended. All three are pure
 * functions of the consignment and an explicit instant, so none of them drifts
 * with the wall clock.
 */

export const EWAY_TRANSPORT_MODES: Record<TransportMode, { code: '1' | '2' | '3' | '4'; label: string }> = {
  road: { code: '1', label: 'Road' },
  rail: { code: '2', label: 'Rail' },
  air: { code: '3', label: 'Air' },
  ship: { code: '4', label: 'Ship' },
};

export const EWAY_VEHICLE_TYPES: Record<VehicleType, { code: 'R' | 'O'; label: string }> = {
  regular: { code: 'R', label: 'Regular' },
  overDimensional: { code: 'O', label: 'Over-dimensional cargo' },
};

export const EWAY_SUB_SUPPLY_TYPES: Record<EwaySubSupplyType, { code: number; label: string }> = {
  supply: { code: 1, label: 'Supply' },
  export: { code: 3, label: 'Export' },
  jobWork: { code: 4, label: 'Job work' },
  ownUse: { code: 5, label: 'For own use' },
  jobWorkReturn: { code: 6, label: 'Job work returns' },
  salesReturn: { code: 8, label: 'Sales return' },
  exhibition: { code: 9, label: 'Exhibition or fairs' },
  lineSales: { code: 10, label: 'Line sales' },
  recipientNotKnown: { code: 11, label: 'Recipient not known' },
  others: { code: 12, label: 'Others' },
};

export const EWAY_CANCEL_REASONS: Record<CancelReasonCode, string> = {
  '1': 'Duplicate',
  '2': 'Order cancelled',
  '3': 'Data entry mistake',
  '4': 'Other',
};

export const EWAY_EXTEND_REASONS: Record<EwayExtendReasonCode, string> = {
  '1': 'Natural calamity',
  '2': 'Law and order situation',
  '3': 'Transhipment',
  '4': 'Accident',
  '5': 'Other',
};

export const EWAY_PART_B_REASONS: Record<EwayPartBReasonCode, string> = {
  '1': 'First time',
  '2': 'Vehicle breakdown',
  '3': 'Transhipment',
  '4': 'Others',
};

/** Only these document kinds accompany a movement of goods in this app. */
export const EWAY_MOVEMENT_KINDS: DocumentKind[] = ['invoice', 'delivery'];

/** Rule 138(10): one day for every 200 km, or part thereof, for regular cargo. */
export const KM_PER_DAY_REGULAR = 200;

/** Rule 138(10) proviso: one day for every 20 km for over-dimensional cargo. */
export const KM_PER_DAY_ODC = 20;

/** Rule 138(9): a bill can be cancelled within 24 hours, if not yet verified in transit. */
export const EWAY_CANCEL_WINDOW_HOURS = 24;

/** Validity can be extended from eight hours before expiry to eight hours after. */
export const EWAY_EXTENSION_WINDOW_HOURS = 8;

/** The portal caps a single bill at 4,000 km. */
export const EWAY_MAX_DISTANCE_KM = 4000;

/**
 * Indian registration marks, including the newer BH series and the defence and
 * temporary formats the portal accepts.
 */
export const VEHICLE_NUMBER_RE =
  /^(?:[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}|[0-9]{2}BH[0-9]{4}[A-Z]{1,2}|DF[0-9]{10}|TR[0-9]{2}[A-Z]{1,3}[0-9]{4})$/;

export const PINCODE_RE = /^[1-9][0-9]{5}$/;
export const EWAY_NUMBER_RE = /^[0-9]{12}$/;

const HOUR = 3600 * 1000;

/* ------------------------------------------------------------------ */
/* Requirement                                                         */
/* ------------------------------------------------------------------ */

export type EwayRequirement = { required: boolean; reason: string };

/** Lines that resolve to a stocked good. Services never trigger an e-way bill. */
export function hasGoods(doc: BusinessDocument, items: Pick<Item, 'id' | 'type'>[]): boolean {
  const type = new Map(items.map((i) => [i.id, i.type]));
  return doc.lines.some((line) => (line.itemId ? type.get(line.itemId) === 'goods' : false));
}

/**
 * Whether this consignment needs an e-way bill. Returns the first failing
 * condition so the card can explain itself.
 */
export function isEwayBillRequired(args: {
  document: BusinessDocument;
  items: Pick<Item, 'id' | 'type'>[];
  settings: ComplianceSettings;
}): EwayRequirement {
  const { document: doc, items, settings } = args;
  const no = (reason: string): EwayRequirement => ({ required: false, reason });

  if (!settings.ewayBillEnabled) return no('E-way bills are switched off in settings');
  if (!EWAY_MOVEMENT_KINDS.includes(doc.kind)) {
    return no('Only invoices and delivery notes carry a movement of goods');
  }
  if (doc.status === 'draft' || doc.status === 'requested') {
    return no('The document has not been finalised yet');
  }
  if (doc.status === 'cancelled') return no('The document is cancelled');
  if (!hasGoods(doc, items)) return no('The document has no goods on it');

  // The statute says the value must *exceed* the threshold, not merely meet it.
  if (doc.totals.grandTotal.minor <= settings.ewayBillThreshold.minor) {
    return no('The consignment value is at or below the threshold');
  }

  return { required: true, reason: 'Goods moving above the threshold value' };
}

/* ------------------------------------------------------------------ */
/* Validity                                                            */
/* ------------------------------------------------------------------ */

/**
 * Validity in days under rule 138(10).
 *
 *   regular cargo           one day per 200 km, or part thereof
 *   over-dimensional cargo  one day per  20 km, or part thereof
 *
 *   200 km -> 1 day    201 km -> 2 days    400 km -> 2 days    401 km -> 3 days
 *    20 km -> 1 day (ODC)     21 km -> 2 days (ODC)
 *
 * The "or part thereof" is the ceiling, and every consignment gets at least one
 * day however short the journey.
 */
export function validityDays(distanceKm: number, vehicleType: VehicleType): number {
  const perDay = vehicleType === 'overDimensional' ? KM_PER_DAY_ODC : KM_PER_DAY_REGULAR;
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 1;
  return Math.max(1, Math.ceil(distanceKm / perDay));
}

/**
 * The instant a bill stops being valid.
 *
 * Rule 138(10) counts each day as expiring at midnight of the day immediately
 * following the date of generation, so the *time* of generation is deliberately
 * discarded: a bill raised at 23:50 expires at the same moment as one raised at
 * 00:10 on the same date.
 */
export function validUptoFor(
  generatedAt: string,
  distanceKm: number,
  vehicleType: VehicleType,
): string {
  const days = validityDays(distanceKm, vehicleType);
  const start = new Date(generatedAt);
  const end = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + days, 23, 59, 59, 999),
  );
  return end.toISOString();
}

/** Signed hours until expiry — negative once the bill has expired. */
export function hoursUntilExpiry(bill: EwayBill, now: string): number {
  return (new Date(bill.validUpto).getTime() - new Date(now).getTime()) / HOUR;
}

/**
 * The status shown to a user. Never stored, because "expired" is a fact about
 * the clock rather than about the record. Cancellation wins over expiry.
 */
export function ewayBillStatusAt(bill: EwayBill, now: string): EwayBillStatus {
  if (bill.status === 'cancelled') return 'cancelled';
  return new Date(now).getTime() <= new Date(bill.validUpto).getTime() ? 'active' : 'expired';
}

/* ------------------------------------------------------------------ */
/* Extension, cancellation, Part-B                                      */
/* ------------------------------------------------------------------ */

export function extensionWindow(bill: EwayBill): { opensAt: string; closesAt: string } {
  const expiry = new Date(bill.validUpto).getTime();
  return {
    opensAt: new Date(expiry - EWAY_EXTENSION_WINDOW_HOURS * HOUR).toISOString(),
    closesAt: new Date(expiry + EWAY_EXTENSION_WINDOW_HOURS * HOUR).toISOString(),
  };
}

export function canExtendEwayBill(
  bill: EwayBill,
  now: string,
): { allowed: boolean; reason?: string; opensAt: string; closesAt: string } {
  const window = extensionWindow(bill);
  if (bill.status === 'cancelled') {
    return { ...window, allowed: false, reason: 'The bill has been cancelled' };
  }
  const t = new Date(now).getTime();
  if (t < new Date(window.opensAt).getTime()) {
    return { ...window, allowed: false, reason: 'Extension opens eight hours before expiry' };
  }
  if (t > new Date(window.closesAt).getTime()) {
    return { ...window, allowed: false, reason: 'Extension closed eight hours after expiry' };
  }
  return { ...window, allowed: true };
}

/** A fresh validity computed from the remaining journey, not the original one. */
export function extendedValidUpto(
  now: string,
  remainingDistanceKm: number,
  vehicleType: VehicleType,
): string {
  return validUptoFor(now, remainingDistanceKm, vehicleType);
}

export function cancelDeadlineFor(generatedAt: string): string {
  return new Date(new Date(generatedAt).getTime() + EWAY_CANCEL_WINDOW_HOURS * HOUR).toISOString();
}

export function canCancelEwayBill(
  bill: EwayBill,
  now: string,
): { allowed: boolean; reason?: string; deadline: string } {
  const deadline = cancelDeadlineFor(bill.generatedAt);
  if (bill.status === 'cancelled') {
    return { allowed: false, reason: 'The bill has already been cancelled', deadline };
  }
  if (new Date(now).getTime() >= new Date(deadline).getTime()) {
    return {
      allowed: false,
      reason: 'The 24-hour cancellation window has closed',
      deadline,
    };
  }
  return { allowed: true, deadline };
}

export function canUpdatePartB(bill: EwayBill, now: string): { allowed: boolean; reason?: string } {
  const status = ewayBillStatusAt(bill, now);
  if (status === 'cancelled') return { allowed: false, reason: 'The bill has been cancelled' };
  if (status === 'expired') return { allowed: false, reason: 'The bill has expired' };
  return { allowed: true };
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

function issue(
  code: string,
  field: string,
  message: string,
  severity: ComplianceIssue['severity'] = 'blocking',
): ComplianceIssue {
  return { code, field, message, severity };
}

/** Field-level check in the `@/lib/validators` style: a message, or nothing. */
export function validVehicleNumber(value: string | undefined): string | undefined {
  if (!value) return 'Enter the vehicle number';
  const raw = value.trim();
  if (raw !== raw.toUpperCase()) return 'Use capital letters, as on the registration plate';
  if (/[\s-]/.test(raw)) return 'Enter the number without spaces or hyphens';
  return VEHICLE_NUMBER_RE.test(raw) ? undefined : 'Enter a number like MH12AB1234';
}

export function validPincode(value: string | undefined): string | undefined {
  if (!value) return 'Enter the PIN code';
  return PINCODE_RE.test(value.trim()) ? undefined : 'Enter a six-digit PIN code';
}

export function validPlaceGstin(value: string | undefined): string | undefined {
  if (!value) return 'Enter the GSTIN, or URP if unregistered';
  const raw = value.trim().toUpperCase();
  if (raw === 'URP') return undefined;
  return GSTIN_RE.test(raw) ? undefined : 'Enter a valid GSTIN, or URP if unregistered';
}

export type EwayPartAInput = {
  from: EwayPlace;
  to: EwayPlace;
  subSupplyType: EwaySubSupplyType;
  subSupplyDescription?: string;
  documentNumber: string;
  documentDate: string;
  consignmentValueMinor: number;
  mainHsnCode?: string;
};

export function validatePartA(input: EwayPartAInput): ComplianceIssue[] {
  const out: ComplianceIssue[] = [];

  ([
    ['from', input.from],
    ['to', input.to],
  ] as const).forEach(([side, place]) => {
    const gstin = validPlaceGstin(place.gstin);
    if (gstin) out.push(issue('EWB101', `${side}.gstin`, gstin));

    const pin = validPincode(place.pincode);
    if (pin) out.push(issue('EWB102', `${side}.pincode`, pin));

    if (!place.place?.trim()) out.push(issue('EWB103', `${side}.place`, 'Enter the place'));
    if (!place.address1?.trim()) out.push(issue('EWB104', `${side}.address1`, 'Enter the address'));
    if (!INDIAN_STATES.some((s) => s.code === place.stateCode)) {
      out.push(issue('EWB105', `${side}.stateCode`, 'Choose a state'));
    }
  });

  if (input.subSupplyType === 'others' && !input.subSupplyDescription?.trim()) {
    out.push(issue('EWB106', 'subSupplyDescription', 'Describe the sub-supply type'));
  }
  if (!input.documentNumber?.trim()) {
    out.push(issue('EWB107', 'documentNumber', 'The document number is missing'));
  }
  if (!input.documentDate) {
    out.push(issue('EWB108', 'documentDate', 'The document date is missing'));
  }
  if (!(input.consignmentValueMinor > 0)) {
    out.push(issue('EWB109', 'consignmentValue', 'The consignment value must be above zero'));
  }
  if (!input.mainHsnCode) {
    out.push(issue('EWB110', 'mainHsnCode', 'No HSN code could be read from the document lines'));
  }

  return out;
}

export type EwayPartBInput = {
  transportMode: TransportMode;
  vehicleNumber?: string;
  vehicleType: VehicleType;
  transporterId?: string;
  transportDocNumber?: string;
  transportDocDate?: string;
  distanceKm: number;
  now: string;
};

export function validatePartB(input: EwayPartBInput): ComplianceIssue[] {
  const out: ComplianceIssue[] = [];

  if (input.transportMode === 'road') {
    const vehicle = validVehicleNumber(input.vehicleNumber);
    if (vehicle) out.push(issue('EWB201', 'vehicleNumber', vehicle));
  } else {
    // Rail, air and ship move under a transport document, not a vehicle number.
    if (!input.transportDocNumber?.trim()) {
      out.push(issue('EWB202', 'transportDocNumber', 'Enter the transport document number'));
    }
    if (!input.transportDocDate) {
      out.push(issue('EWB203', 'transportDocDate', 'Enter the transport document date'));
    } else if (input.transportDocDate > input.now.slice(0, 10)) {
      out.push(issue('EWB204', 'transportDocDate', 'The transport document is dated in the future'));
    }
    if (input.vehicleNumber?.trim()) {
      out.push(
        issue('EWB205', 'vehicleNumber', 'A vehicle number does not belong on a rail, air or ship consignment'),
      );
    }
  }

  if (input.transporterId?.trim() && input.transporterId.trim().length !== 15) {
    out.push(issue('EWB206', 'transporterId', 'A transporter ID is 15 characters'));
  }

  if (!Number.isFinite(input.distanceKm) || input.distanceKm < 1) {
    out.push(issue('EWB207', 'distanceKm', 'Enter the approximate distance in kilometres'));
  } else if (input.distanceKm > EWAY_MAX_DISTANCE_KM) {
    out.push(
      issue('EWB208', 'distanceKm', `The portal accepts at most ${EWAY_MAX_DISTANCE_KM} km on one bill`),
    );
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Defaults and payload                                                */
/* ------------------------------------------------------------------ */

export function ewayDocTypeFor(kind: DocumentKind): EwayDocType {
  return kind === 'invoice' ? 'INV' : 'CHL';
}

/**
 * Both kinds default to an ordinary supply: a delivery note here accompanies
 * goods going to a customer, and branch-to-branch movement goes through the
 * inventory transfer screen instead. The form lets the user pick another.
 */
export function subSupplyTypeFor(_kind: DocumentKind): EwaySubSupplyType {
  return 'supply';
}

/** Build a place record from a company address. */
export function placeFromCompany(company: Company): EwayPlace {
  return {
    legalName: company.legalName ?? company.name,
    gstin: company.taxRegistration?.identifier ?? 'URP',
    address1: company.address.line1,
    address2: company.address.line2,
    place: company.address.city,
    pincode: company.address.postalCode,
    stateCode: company.address.stateCode ?? '',
  };
}

export type EwbPayload = {
  supplyType: 'O' | 'I';
  subSupplyType: number;
  subSupplyDesc?: string;
  docType: EwayDocType;
  docNo: string;
  docDate: string;
  transactionType: number;
  fromGstin: string;
  fromTrdName: string;
  fromAddr1: string;
  fromAddr2?: string;
  fromPlace: string;
  fromPincode: number;
  fromStateCode: string;
  toGstin: string;
  toTrdName: string;
  toAddr1: string;
  toAddr2?: string;
  toPlace: string;
  toPincode: number;
  toStateCode: string;
  totalValue: number;
  cgstValue: number;
  sgstValue: number;
  igstValue: number;
  totInvValue: number;
  mainHsnCode?: string;
  itemCount: number;
  transporterId?: string;
  transporterName?: string;
  transDocNo?: string;
  transDocDate?: string;
  transMode: '1' | '2' | '3' | '4';
  transDistance: number;
  vehicleNo?: string;
  vehicleType: 'R' | 'O';
};

export function buildEwbPayload(bill: Omit<EwayBill, 'id' | 'ewayBillNumber' | 'validFrom' | 'validUpto' | 'status' | 'createdAt' | 'updatedAt' | 'partBUpdates' | 'extensions'>): EwbPayload {
  const toMajorUnits = (minor: number) => Math.round(minor) / 100;
  return {
    supplyType: bill.supplyType === 'outward' ? 'O' : 'I',
    subSupplyType: EWAY_SUB_SUPPLY_TYPES[bill.subSupplyType].code,
    subSupplyDesc: bill.subSupplyDescription,
    docType: bill.docType,
    docNo: bill.documentNumber,
    docDate: bill.documentDate,
    transactionType: bill.transactionType,
    fromGstin: bill.from.gstin,
    fromTrdName: bill.from.legalName,
    fromAddr1: bill.from.address1,
    fromAddr2: bill.from.address2,
    fromPlace: bill.from.place,
    fromPincode: Number(bill.from.pincode) || 0,
    fromStateCode: bill.from.stateCode,
    toGstin: bill.to.gstin,
    toTrdName: bill.to.legalName,
    toAddr1: bill.to.address1,
    toAddr2: bill.to.address2,
    toPlace: bill.to.place,
    toPincode: Number(bill.to.pincode) || 0,
    toStateCode: bill.to.stateCode,
    totalValue: toMajorUnits(bill.taxableValue.minor),
    cgstValue: toMajorUnits(bill.cgst.minor),
    sgstValue: toMajorUnits(bill.sgst.minor),
    igstValue: toMajorUnits(bill.igst.minor),
    totInvValue: toMajorUnits(bill.consignmentValue.minor),
    mainHsnCode: bill.mainHsnCode,
    itemCount: bill.itemCount,
    transporterId: bill.transporterId,
    transporterName: bill.transporterName,
    transDocNo: bill.transportDocNumber,
    transDocDate: bill.transportDocDate,
    transMode: EWAY_TRANSPORT_MODES[bill.transportMode].code,
    transDistance: bill.distanceKm,
    vehicleNo: bill.vehicleNumber,
    vehicleType: EWAY_VEHICLE_TYPES[bill.vehicleType].code,
  };
}
