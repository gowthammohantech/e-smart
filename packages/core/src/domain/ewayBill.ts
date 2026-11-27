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
} from '../types';
import { isValidGstin } from './gstin';
import { INDIAN_STATES, stateName } from '../data/masters';
import { EWB_OTHER_COUNTRY_CODE } from './stateCodes';
import { pincodeContradictsState } from './pincodeStates';
import { PINCODE_RE } from '../lib/validators';
import { daysBetween } from '../lib/date';

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

/** NIC master codes for the sub-supply type (1 Supply, 2 Import, 3 Export, 4 Job work, 5 Own use, 6 Job work returns, 7 Sales return, 8 Others, 9 SKD/CKD, 10 Line sales, 11 Recipient not known, 12 Exhibition or fairs). */
export const EWAY_SUB_SUPPLY_TYPES: Record<EwaySubSupplyType, { code: number; label: string }> = {
  supply: { code: 1, label: 'Supply' },
  export: { code: 3, label: 'Export' },
  jobWork: { code: 4, label: 'Job work' },
  ownUse: { code: 5, label: 'For own use' },
  jobWorkReturn: { code: 6, label: 'Job work returns' },
  salesReturn: { code: 7, label: 'Sales return' },
  others: { code: 8, label: 'Others' },
  lineSales: { code: 10, label: 'Line sales' },
  recipientNotKnown: { code: 11, label: 'Recipient not known' },
  exhibition: { code: 12, label: 'Exhibition or fairs' },
};

/**
 * Which document types the portal accepts with each sub-supply type on an
 * OUTWARD bill (NIC master codes). Anything else comes back as error 611,
 * "Invalid document type for the supply type". Job work returns and sales
 * returns are inward-only, so they accept nothing here.
 */
export const EWAY_OUTWARD_DOC_TYPES: Record<EwaySubSupplyType, readonly EwayDocType[]> = {
  supply: ['INV', 'BIL'],
  export: ['INV', 'BIL'],
  jobWork: ['CHL'],
  ownUse: ['CHL'],
  jobWorkReturn: [],
  salesReturn: [],
  others: ['CHL', 'OTH'],
  lineSales: ['CHL'],
  recipientNotKnown: ['CHL', 'OTH'],
  exhibition: ['CHL'],
};

/** The sub-supply types the portal accepts on an outward bill for this document type. */
export function subSupplyTypesFor(docType: EwayDocType): EwaySubSupplyType[] {
  return (Object.keys(EWAY_OUTWARD_DOC_TYPES) as EwaySubSupplyType[]).filter((key) =>
    EWAY_OUTWARD_DOC_TYPES[key].includes(docType),
  );
}

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

export { PINCODE_RE };
export const EWAY_NUMBER_RE = /^[0-9]{12}$/;

const HOUR = 3600 * 1000;

/* ------------------------------------------------------------------ */
/* Requirement                                                         */
/* ------------------------------------------------------------------ */

export type EwayRequirement = { required: boolean; reason: string };

/**
 * Whether any line is a good. A catalogue line goes by its item's type; a line
 * typed in by hand (or whose item is gone) counts as goods unless its code is a
 * SAC (99…), the service chapter. Services never trigger an e-way bill.
 */
export function hasGoods(doc: BusinessDocument, items: Pick<Item, 'id' | 'type'>[]): boolean {
  const type = new Map(items.map((i) => [i.id, i.type]));
  return doc.lines.some((line) => {
    const itemType = line.itemId ? type.get(line.itemId) : undefined;
    return itemType ? itemType === 'goods' : !line.hsnCode?.trim().startsWith('99');
  });
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
    return no('Only invoices and delivery challans carry a movement of goods');
  }
  if (doc.status === 'draft' || doc.status === 'requested') {
    return no('The document has not been finalised yet');
  }
  if (doc.status === 'cancelled') return no('The document is cancelled');
  if (!hasGoods(doc, items)) return no('The document has no goods on it');

  // The statute says the value must *exceed* the threshold, not merely meet it. The
  // threshold is in rupees, so a document in another currency is converted first.
  if (Math.round(doc.totals.grandTotal.minor * (doc.exchangeRate || 1)) <= settings.ewayBillThreshold.minor) {
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
    return { ...window, allowed: false, reason: 'This e-way bill has been cancelled' };
  }
  const t = new Date(now).getTime();
  if (t < new Date(window.opensAt).getTime()) {
    return { ...window, allowed: false, reason: 'An e-way bill can be extended only in the last 8 hours before it expires' };
  }
  if (t > new Date(window.closesAt).getTime()) {
    return { ...window, allowed: false, reason: 'The time to extend this e-way bill (up to 8 hours after it expired) has passed' };
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
    return { allowed: false, reason: 'This e-way bill has already been cancelled', deadline };
  }
  if (new Date(now).getTime() >= new Date(deadline).getTime()) {
    return {
      allowed: false,
      reason: 'An e-way bill can be cancelled only within 24 hours of creating it, and that time has passed',
      deadline,
    };
  }
  return { allowed: true, deadline };
}

export function canUpdatePartB(bill: EwayBill, now: string): { allowed: boolean; reason?: string } {
  const status = ewayBillStatusAt(bill, now);
  if (status === 'cancelled') return { allowed: false, reason: 'This e-way bill has been cancelled' };
  if (status === 'expired') return { allowed: false, reason: 'This e-way bill has expired' };
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

/** What a person types, as the portal wants it: capitals, no spaces or hyphens. */
export function normalizeVehicleNumber(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
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
  return isValidGstin(raw) ? undefined : 'Enter a valid GSTIN, or URP if unregistered';
}

export type EwayPartAInput = {
  from: EwayPlace;
  to: EwayPlace;
  subSupplyType: EwaySubSupplyType;
  subSupplyDescription?: string;
  /** The document being moved; its portal document type is checked against the sub-supply type. */
  documentKind?: DocumentKind;
  /** Or the portal document type itself, when the caller already holds it. */
  docType?: EwayDocType;
  documentNumber: string;
  documentDate: string;
  consignmentValueMinor: number;
  mainHsnCode?: string;
  /** The tax heads on the document; with them, a bill carrying both CGST/SGST and IGST is refused. */
  cgstMinor?: number;
  sgstMinor?: number;
  igstMinor?: number;
  /** The instant of generating; with it, the document date's window is checked. */
  now?: string;
};

/** NIC's GENEWAYBILL limits (API v1.03). */
export const EWAY_DOC_NO_RE = /^[A-Za-z1-9][A-Za-z0-9/-]{0,15}$/;
export const EWAY_DOC_MAX_AGE_DAYS = 180;
export const EWAY_SUB_SUPPLY_DESC_MAX = 20;
export const EWAY_NAME_MAX = 100;
export const EWAY_ADDRESS_MAX = 120;
export const EWAY_PLACE_MAX = 50;
export const EWAY_TRANS_DOC_NO_MAX = 15;

export function validatePartA(input: EwayPartAInput): ComplianceIssue[] {
  const out: ComplianceIssue[] = [];
  const exported = input.subSupplyType === 'export';

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
    // The portal's field lengths: a longer value is refused, not cut.
    if ((place.legalName?.trim().length ?? 0) > EWAY_NAME_MAX) {
      out.push(issue('EWB118', `${side}.legalName`, `Keep the name to ${EWAY_NAME_MAX} characters`));
    }
    if ((place.address1?.trim().length ?? 0) > EWAY_ADDRESS_MAX) {
      out.push(issue('EWB119', `${side}.address1`, `Keep the address to ${EWAY_ADDRESS_MAX} characters`));
    }
    if ((place.address2?.trim().length ?? 0) > EWAY_ADDRESS_MAX) {
      out.push(issue('EWB119', `${side}.address2`, `Keep the second address line to ${EWAY_ADDRESS_MAX} characters`));
    }
    if ((place.place?.trim().length ?? 0) > EWAY_PLACE_MAX) {
      out.push(issue('EWB120', `${side}.place`, `Keep the place to ${EWAY_PLACE_MAX} characters`));
    }
    // The PIN must belong to the state (NIC checks it against the state code).
    if (!pin && pincodeContradictsState(place.pincode, place.stateCode)) {
      out.push(issue('EWB121', `${side}.pincode`, `This PIN code isn’t in ${stateName(place.stateCode)}. Check the PIN or the state`));
    }
    // Both ends are in India: an export's "to" is the port it leaves from; the bill names Other Country itself.
    if (!INDIAN_STATES.some((s) => s.code === place.stateCode)) {
      out.push(
        issue(
          'EWB105',
          `${side}.stateCode`,
          side === 'to' && exported ? 'Choose the state of the port, airport or land customs station the goods leave India from' : 'Choose a state',
        ),
      );
    }
  });

  // An export (NIC): the consignee is URP, and its address, place and PIN are the port of export's.
  if (exported && input.to.gstin.trim().toUpperCase() !== 'URP') {
    out.push(issue('EWB112', 'to.gstin', 'For an export, enter URP: the buyer abroad has no GSTIN'));
  }

  if (input.subSupplyType === 'others' && !input.subSupplyDescription?.trim()) {
    out.push(issue('EWB106', 'subSupplyDescription', 'Describe the sub-supply type'));
  } else if (input.subSupplyType === 'others' && input.subSupplyDescription!.trim().length > EWAY_SUB_SUPPLY_DESC_MAX) {
    out.push(issue('EWB113', 'subSupplyDescription', `Keep the description to ${EWAY_SUB_SUPPLY_DESC_MAX} characters`));
  }
  const docType = input.docType ?? (input.documentKind ? ewayDocTypeFor(input.documentKind) : undefined);
  if (docType && !EWAY_OUTWARD_DOC_TYPES[input.subSupplyType].includes(docType)) {
    const label = EWAY_SUB_SUPPLY_TYPES[input.subSupplyType].label;
    out.push(
      issue(
        'EWB111',
        'subSupplyType',
        docType === 'CHL'
          ? `The portal does not accept a delivery challan under "${label}". Choose another sub-supply type (for example Others), or raise the e-way bill from the invoice`
          : `The portal does not accept this document under "${label}". Choose another sub-supply type`,
      ),
    );
  }
  const docNo = input.documentNumber?.trim() ?? '';
  if (!docNo) {
    out.push(issue('EWB107', 'documentNumber', 'The document number is missing'));
  } else if (docNo.length > 16) {
    out.push(issue('EWB114', 'documentNumber', `The portal takes a document number of at most 16 characters; ${docNo} has ${docNo.length}`));
  } else if (!EWAY_DOC_NO_RE.test(docNo)) {
    out.push(issue('EWB115', 'documentNumber', 'The portal takes only letters, numbers, / and - in a document number, and not 0, / or - first'));
  }
  if (!input.documentDate) {
    out.push(issue('EWB108', 'documentDate', 'The document date is missing'));
  } else if (input.now) {
    // Not in the future, and not more than 180 days old.
    const today = input.now.slice(0, 10);
    if (input.documentDate > today) {
      out.push(issue('EWB116', 'documentDate', 'The document is dated in the future; the portal refuses it until that date'));
    } else if (daysBetween(input.documentDate, today) > EWAY_DOC_MAX_AGE_DAYS) {
      out.push(issue('EWB117', 'documentDate', `The portal refuses an e-way bill for a document more than ${EWAY_DOC_MAX_AGE_DAYS} days old`));
    }
  }
  if (!(input.consignmentValueMinor > 0)) {
    out.push(issue('EWB109', 'consignmentValue', 'The consignment value must be above zero'));
  }
  const hsn = input.mainHsnCode?.trim();
  if (!hsn) {
    out.push(issue('EWB110', 'mainHsnCode', 'No HSN code could be read from the document lines'));
  } else if (!/^[0-9]{4,8}$/.test(hsn)) {
    out.push(issue('EWB122', 'mainHsnCode', `The main HSN code ${hsn} must be 4 to 8 digits`));
  } else if (hsn.startsWith('99')) {
    // Chapter 99 is services (SAC): an e-way bill moves goods.
    out.push(issue('EWB123', 'mainHsnCode', `The main HSN code ${hsn} is a service (chapter 99); an e-way bill needs the HSN of the goods`));
  }

  // CGST + SGST within a state, IGST across states and on exports: never both on one bill.
  const cgst = input.cgstMinor ?? 0;
  const sgst = input.sgstMinor ?? 0;
  const igst = input.igstMinor ?? 0;
  const local = cgst !== 0 || sgst !== 0;
  if (local && igst !== 0) {
    out.push(issue('EWB124', 'tax', 'The document carries both CGST/SGST and IGST; the portal takes one or the other'));
  } else if (local && exported) {
    out.push(issue('EWB125', 'tax', 'An export carries IGST (or no tax under LUT), not CGST/SGST'));
  } else if (!exported && input.from.stateCode && input.to.stateCode) {
    const sameState = input.from.stateCode === input.to.stateCode;
    // Warnings only: an SEZ supply carries IGST within a state, and a bill-to in another state can differ.
    if (sameState && igst !== 0) {
      out.push(issue('EWB126', 'tax', 'Both ends are in one state but the document carries IGST; the portal expects CGST + SGST unless it is an SEZ supply', 'warning'));
    } else if (!sameState && local) {
      out.push(issue('EWB127', 'tax', 'The ends are in different states but the document carries CGST + SGST; the portal expects IGST', 'warning'));
    }
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
  /** The road distance between the two PINs, where it could be looked up; a typed distance may be at most 10% over it. */
  roadDistanceKm?: number;
  now: string;
};

/** NIC lets a typed distance run at most 10% over the road distance between the PINs. */
export const EWAY_DISTANCE_ALLOWANCE = 0.1;

/** The most a typed distance may be, given the road distance between the PINs. */
export function maxDistanceKm(roadDistanceKm: number): number {
  return Math.floor(roadDistanceKm * (1 + EWAY_DISTANCE_ALLOWANCE));
}

export function validatePartB(input: EwayPartBInput): ComplianceIssue[] {
  const out: ComplianceIssue[] = [];

  if (input.transportMode === 'road') {
    const vehicle = validVehicleNumber(input.vehicleNumber);
    if (vehicle) out.push(issue('EWB201', 'vehicleNumber', vehicle));
  } else {
    // Rail, air and ship move under a transport document, not a vehicle number.
    if (!input.transportDocNumber?.trim()) {
      out.push(issue('EWB202', 'transportDocNumber', 'Enter the transport document number'));
    } else if (input.transportDocNumber.trim().length > EWAY_TRANS_DOC_NO_MAX) {
      out.push(issue('EWB209', 'transportDocNumber', `The portal takes a transport document number of at most ${EWAY_TRANS_DOC_NO_MAX} characters`));
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

  if (input.transporterId?.trim() && !isValidGstin(input.transporterId)) {
    // A TRANSIN has the GSTIN's shape and check digit, so one test covers both.
    out.push(issue('EWB206', 'transporterId', 'Enter the transporter’s 15-character GSTIN or transporter ID'));
  }

  if (!Number.isFinite(input.distanceKm) || input.distanceKm < 1) {
    out.push(issue('EWB207', 'distanceKm', 'Enter the approximate distance in kilometres'));
  } else if (input.distanceKm > EWAY_MAX_DISTANCE_KM) {
    out.push(
      issue('EWB208', 'distanceKm', `The portal accepts at most ${EWAY_MAX_DISTANCE_KM} km on one bill`),
    );
  } else if (input.roadDistanceKm && input.roadDistanceKm > 0 && input.distanceKm > maxDistanceKm(input.roadDistanceKm)) {
    out.push(
      issue(
        'EWB210',
        'distanceKm',
        `The road distance between the PIN codes is ${input.roadDistanceKm} km; the portal allows at most ${maxDistanceKm(input.roadDistanceKm)} km. Enter 0 to let the portal work it out`,
      ),
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
 * An invoice is an ordinary supply. The portal never accepts a challan with
 * "Supply", so a delivery challan defaults to "Others" (the one challan-valid
 * sub-supply that allows a different buyer). The form lets the user pick another
 * from the types valid for the document.
 */
export function subSupplyTypeFor(kind: DocumentKind): EwaySubSupplyType {
  // The portal refuses a challan under "Supply", so a delivery note starts at "Others" (see subSupplyDescriptionFor).
  return ewayDocTypeFor(kind) === 'CHL' ? 'others' : 'supply';
}

/** The description "Others" needs; empty where the sub-supply type is self-explanatory. */
export function subSupplyDescriptionFor(kind: DocumentKind): string {
  return ewayDocTypeFor(kind) === 'CHL' ? 'Delivery challan' : '';
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
  /** Bill-to state: Other Country (99) on an export. */
  toStateCode: string;
  /** Ship-to state, where the goods actually go in India: on an export, the port of export's. */
  actToStateCode: string;
  totalValue: number;
  cgstValue: number;
  sgstValue: number;
  igstValue: number;
  /** Charges, round-off and anything else between the taxed value and the invoice total (can be negative). */
  otherValue: number;
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
    // An export's "to" is the port it leaves India from: billed to Other Country, shipped to the port's state.
    toStateCode: bill.subSupplyType === 'export' ? EWB_OTHER_COUNTRY_CODE : bill.to.stateCode,
    actToStateCode: bill.to.stateCode,
    totalValue: toMajorUnits(bill.taxableValue.minor),
    cgstValue: toMajorUnits(bill.cgst.minor),
    sgstValue: toMajorUnits(bill.sgst.minor),
    igstValue: toMajorUnits(bill.igst.minor),
    // NIC: totInvValue = totalValue + taxes + otherValue, so the rest of the invoice total goes here.
    otherValue: toMajorUnits(bill.consignmentValue.minor - bill.taxableValue.minor - bill.cgst.minor - bill.sgst.minor - bill.igst.minor),
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
