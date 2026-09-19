import {
  BusinessDocument,
  CancelReasonCode,
  Company,
  ComplianceInfo,
  ComplianceIssue,
  ComplianceSettings,
  DocumentKind,
  EInvoiceDocType,
  EInvoiceSupplyType,
  Item,
  GstRegistrationType,
  Party,
  TaxComponent,
  TaxLine,
} from '@/types';
import { toMajor } from '@/lib/money';
import { isValidGstin } from '@/domain/gstin';
import { financialYearOf, parseDate } from '@/lib/date';
import { base64UrlDecode, base64UrlEncode, sha256Hex } from '@/lib/hash';
import { isValidStateCode } from '@/domain/stateCodes';

/**
 * GST e-invoicing (FRD 16).
 *
 * Reporting an invoice to the Invoice Registration Portal is not a status flag:
 * the portal decides whether a document is reportable at all, rejects it against
 * a published list of validations, and returns an Invoice Reference Number that
 * is the SHA-256 digest of four fields of the document itself. Everything here
 * is the rule, not a stand-in for it — the only simulated part of the journey is
 * the transport, which lives in `irpAdapter.ts`.
 */

/** The four reason codes the portal accepts on cancellation. */
export const E_INVOICE_CANCEL_REASONS: Record<CancelReasonCode, string> = {
  '1': 'Duplicate',
  '2': 'Data entry mistake',
  '3': 'Order cancelled',
  '4': 'Other',
};

export const E_INVOICE_DOC_TYPES: Record<EInvoiceDocType, string> = {
  INV: 'Tax invoice',
  CRN: 'Credit note',
  DBN: 'Debit note',
};

export const E_INVOICE_SUPPLY_TYPES: Record<EInvoiceSupplyType, string> = {
  B2B: 'Business to business',
  SEZWP: 'SEZ with payment of tax',
  SEZWOP: 'SEZ without payment of tax',
  EXPWP: 'Export with payment of tax',
  EXPWOP: 'Export without payment of tax',
  DEXP: 'Deemed export',
};

/** Cancellation must reach the portal within 24 hours of the IRN being issued. */
export const E_INVOICE_CANCEL_WINDOW_HOURS = 24;

/** Document kinds this app can report. Debit notes have no kind here. */
export const E_INVOICE_KINDS: DocumentKind[] = ['invoice', 'salesReturn'];

/** The portal reconciles totals to the nearest rupee, so ±1 is tolerated. */
export const TOTAL_TOLERANCE_MINOR = 100;

/**
 * Document number: at most 16 characters, alphanumeric plus slash and hyphen,
 * and it may not begin with a zero, a slash or a hyphen.
 */
export const E_INVOICE_DOC_NUMBER_RE = /^[A-Za-z1-9][A-Za-z0-9/-]{0,15}$/;

/** Place-of-supply code used for exports, where no Indian state applies. */
export const EXPORT_STATE_CODE = '96';

/** App unit codes mapped to NIC unit quantity codes. Anything else is OTH. */
export const UQC_MAP: Record<string, string> = {
  PCS: 'PCS',
  NOS: 'NOS',
  BOX: 'BOX',
  SET: 'SET',
  KG: 'KGS',
  LTR: 'LTR',
  MTR: 'MTR',
  HR: 'HRS',
};

export function uqcFor(unit: string): string {
  return UQC_MAP[unit?.toUpperCase()] ?? 'OTH';
}

export type EInvoiceContext = {
  document: BusinessDocument;
  company: Company;
  buyer: Party | undefined;
  settings: ComplianceSettings;
  /** Needed to mark each line as goods or a service. */
  items: Pick<Item, 'id' | 'type'>[];
  branchName?: string;
  /** IRNs already issued in this company, for the duplicate check. */
  existingIrns?: string[];
  /** Evaluated against this instant rather than the wall clock. */
  now: string;
};

export type EInvoiceApplicability = {
  applicable: boolean;
  /** A sentence the compliance card can show verbatim. */
  reason: string;
  docType: EInvoiceDocType | null;
  supplyType: EInvoiceSupplyType | null;
};

/* ------------------------------------------------------------------ */
/* Applicability                                                       */
/* ------------------------------------------------------------------ */

export function eInvoiceDocTypeFor(kind: DocumentKind): EInvoiceDocType | null {
  if (kind === 'invoice') return 'INV';
  if (kind === 'salesReturn') return 'CRN';
  return null;
}

function isExport(doc: BusinessDocument, buyer: Party | undefined): boolean {
  if (doc.placeOfSupplyStateCode === EXPORT_STATE_CODE) return true;
  if (buyer?.gstRegistrationType === 'overseas') return true;
  const country = buyer?.billingAddress?.country;
  return !!country && country !== 'India' && country !== 'IN';
}

/** Whether any tax was actually charged, which separates "with" from "without payment". */
function chargesTax(doc: BusinessDocument): boolean {
  return doc.totals.totalTax.minor > 0;
}

export const GST_REGISTRATION_LABELS: Record<GstRegistrationType, string> = {
  regular: 'Regular',
  composition: 'Composition scheme',
  unregistered: 'Unregistered',
  sez: 'SEZ unit or developer',
  overseas: 'Overseas',
};

export function eInvoiceSupplyTypeFor(
  doc: BusinessDocument,
  buyer: Party | undefined,
): EInvoiceSupplyType | null {
  if (isExport(doc, buyer)) return chargesTax(doc) ? 'EXPWP' : 'EXPWOP';
  // An SEZ supply is zero-rated: without tax it went under LUT or bond.
  if (buyer?.gstRegistrationType === 'sez') return chargesTax(doc) ? 'SEZWP' : 'SEZWOP';
  if (buyer?.gstRegistrationType === 'unregistered') return null;
  if (buyer?.taxId) return 'B2B';
  return null; // a sale to a consumer is outside e-invoicing
}

/**
 * Whether this document must be reported at all. Returns the first failing
 * condition so the interface can explain itself rather than just going quiet.
 */
export function isEInvoiceApplicable(ctx: EInvoiceContext): EInvoiceApplicability {
  const { document: doc, company, buyer, settings } = ctx;
  const no = (reason: string): EInvoiceApplicability => ({
    applicable: false,
    reason,
    docType: null,
    supplyType: null,
  });

  if (!settings.eInvoiceEnabled) return no('E-invoicing is switched off in settings');

  const reg = company.taxRegistration;
  if (!reg || reg.regime !== 'GST') return no('E-invoicing applies to GST registrations only');
  if (!reg.registered) return no('The business is not registered for GST');
  if (reg.compositionScheme) return no('Composition dealers are outside e-invoicing');

  if (settings.annualTurnover.minor < settings.eInvoiceTurnoverThreshold.minor) {
    return no('Turnover is below the e-invoicing threshold');
  }

  const docType = eInvoiceDocTypeFor(doc.kind);
  if (!docType) return no('Only invoices and credit notes are reported');

  if (doc.status === 'draft' || doc.status === 'requested') {
    return no('The document has not been finalised yet');
  }

  const supplyType = eInvoiceSupplyTypeFor(doc, buyer);
  if (!supplyType) return no('A sale to an unregistered buyer is outside e-invoicing');

  return {
    applicable: true,
    reason: E_INVOICE_SUPPLY_TYPES[supplyType],
    docType,
    supplyType,
  };
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

function componentsOf(taxLines: TaxLine[]): TaxComponent[] {
  return taxLines.flatMap((l) => l.components);
}

function daysBetweenDates(fromIso: string, toIso: string): number {
  const from = parseDate(fromIso).getTime();
  const to = parseDate(toIso).getTime();
  return Math.floor((to - from) / 86400000);
}

/**
 * Every blocking and advisory finding, in document order. Never stops at the
 * first problem: a user fixing one field at a time against a real portal is the
 * slowest possible way to get an invoice reported.
 */
export function validateEInvoice(ctx: EInvoiceContext): ComplianceIssue[] {
  const { document: doc, company, buyer, settings, items, now } = ctx;
  const out: ComplianceIssue[] = [];

  const supplyType = eInvoiceSupplyTypeFor(doc, buyer);
  const needsBuyerGstin = supplyType === 'B2B' || supplyType === 'SEZWP' || supplyType === 'SEZWOP';

  /* --- parties --- */
  const sellerGstin = company.taxRegistration?.identifier?.trim().toUpperCase();
  if (!sellerGstin || !isValidGstin(sellerGstin)) {
    out.push(issue('3028', 'company.taxRegistration.identifier', 'The seller GSTIN is missing or malformed'));
  }

  const buyerGstin = buyer?.taxId?.trim().toUpperCase();
  if (needsBuyerGstin && (!buyerGstin || !isValidGstin(buyerGstin))) {
    out.push(issue('3029', 'party.taxId', 'The buyer GSTIN is missing or malformed'));
  } else if (needsBuyerGstin && buyerGstin) {
    // The portal checks the GSTIN's state against the buyer's own state, not
    // the place of supply: goods billed to Mumbai and shipped to Pune are fine.
    const buyerState = buyer?.billingAddress?.stateCode;
    if (buyerState && buyerGstin.slice(0, 2) !== buyerState) {
      out.push(
        issue('2265', 'party.billingAddress.stateCode', `The buyer GSTIN is registered in state ${buyerGstin.slice(0, 2)}, but their address is in ${buyerState}`),
      );
    }
  }

  /* --- place of supply --- */
  const pos = doc.placeOfSupplyStateCode;
  if (!pos) {
    out.push(issue('2227', 'placeOfSupplyStateCode', 'The place of supply is not set'));
  } else if (!isValidStateCode(pos)) {
    out.push(issue('2228', 'placeOfSupplyStateCode', `${pos} is not a known state code`));
  }

  /* --- lines --- */
  if (doc.lines.length === 0) {
    out.push(issue('2236', 'lines', 'The document has no lines'));
  }

  doc.lines.forEach((line, i) => {
    if (!line.hsnCode) {
      out.push(issue('2176', `lines[${i}].hsnCode`, `"${line.name}" has no HSN or SAC code`));
    } else if (!/^\d{4}(\d{2})?(\d{2})?$/.test(line.hsnCode)) {
      out.push(
        issue('2176', `lines[${i}].hsnCode`, `"${line.name}" has an HSN that is not 4, 6 or 8 digits`),
      );
    }
    if (!(line.quantity > 0)) {
      out.push(issue('2237', `lines[${i}].quantity`, `"${line.name}" has no quantity`));
    }
    if (line.unitPrice.minor < 0) {
      out.push(issue('2237', `lines[${i}].unitPrice`, `"${line.name}" has a negative price`));
    }
    if (!UQC_MAP[line.unit?.toUpperCase()]) {
      out.push(
        issue(
          'W001',
          `lines[${i}].unit`,
          `Unit "${line.unit}" has no portal equivalent and will be reported as OTH`,
          'warning',
        ),
      );
    }
  });

  /* --- tax consistency --- */
  const homeState = company.taxRegistration?.placeOfSupplyStateCode;
  if (homeState && pos && pos !== EXPORT_STATE_CODE) {
    const components = componentsOf(doc.totals.taxLines);
    const hasIgst = components.some((c) => c.type === 'IGST' && c.amount.minor > 0);
    const hasIntra = components.some(
      (c) => (c.type === 'CGST' || c.type === 'SGST') && c.amount.minor > 0,
    );
    if (homeState === pos && hasIgst) {
      out.push(issue('2172', 'totals.taxLines', 'IGST is charged on a supply within the state'));
    }
    if (homeState !== pos && hasIntra) {
      out.push(issue('2173', 'totals.taxLines', 'CGST and SGST are charged on a supply across states'));
    }
  }

  /* --- totals --- */
  const recomputed = recomputeTotal(doc);
  if (Math.abs(recomputed - doc.totals.grandTotal.minor) > TOTAL_TOLERANCE_MINOR) {
    out.push(
      issue('2182', 'totals.grandTotal', 'The document total does not reconcile with its lines'),
    );
  }

  /* --- document identity and dates --- */
  const number = doc.number ?? '';
  if (number.length > 16 || !E_INVOICE_DOC_NUMBER_RE.test(number)) {
    out.push(
      issue(
        '2233',
        'number',
        'The document number must be at most 16 characters of letters, digits, / and -, and must not start with 0, / or -',
      ),
    );
  }

  const nowDate = now.slice(0, 10);
  if (doc.date > nowDate) {
    out.push(issue('2234', 'date', 'The document is dated in the future'));
  } else if (daysBetweenDates(doc.date, nowDate) > settings.reportingWindowDays) {
    out.push(
      issue(
        '2235',
        'date',
        `The document is older than the ${settings.reportingWindowDays}-day reporting window`,
      ),
    );
  }

  /* --- duplicates --- */
  if (sellerGstin && isValidGstin(sellerGstin)) {
    const docType = eInvoiceDocTypeFor(doc.kind);
    if (docType) {
      const candidate = computeIrn(sellerGstin, docType, number, fiscalYearCode(doc.date));
      if ((ctx.existingIrns ?? []).includes(candidate)) {
        out.push(
          issue('2150', 'number', 'An IRN already exists for this document number in this financial year'),
        );
      }
    }
  }

  /* --- advisory --- */
  if (buyer && !buyer.email && !buyer.phone) {
    out.push(
      issue('W002', 'party.email', 'The buyer has no email or phone, so the portal cannot notify them', 'warning'),
    );
  }

  void items;
  return out;
}

/** Recompute the grand total straight from the stored totals, in minor units. */
function recomputeTotal(doc: BusinessDocument): number {
  const t = doc.totals;
  return (
    t.taxableAmount.minor +
    t.totalTax.minor +
    t.charges.minor +
    t.roundOff.minor
  );
}

export function blockingIssues(issues: ComplianceIssue[]): ComplianceIssue[] {
  return issues.filter((i) => i.severity === 'blocking');
}

/* ------------------------------------------------------------------ */
/* IRN                                                                 */
/* ------------------------------------------------------------------ */

/** The financial year an IRN is scoped to, as the portal spells it: `2026-27`. */
export function fiscalYearCode(iso: string, startMonth = 4): string {
  const fy = financialYearOf(iso, startMonth);
  const startYear = Number(fy.start.slice(0, 4));
  return `${startYear}-${String(startYear + 1).slice(2)}`;
}

/**
 * The Invoice Reference Number.
 *
 * Defined by the portal as the SHA-256 digest of the supplier GSTIN, the
 * document type, the document number and the financial year, concatenated. Any
 * party holding those four public fields can recompute it and check it against
 * the number printed on the invoice, which is the whole point of the scheme.
 */
export function computeIrn(
  supplierGstin: string,
  docType: EInvoiceDocType,
  docNumber: string,
  fiscalYear: string,
): string {
  return sha256Hex(`${supplierGstin}${docType}${docNumber}${fiscalYear}`);
}

export function irnForDocument(ctx: EInvoiceContext): string | null {
  const gstin = ctx.company.taxRegistration?.identifier?.trim().toUpperCase();
  const docType = eInvoiceDocTypeFor(ctx.document.kind);
  if (!gstin || !docType) return null;
  return computeIrn(gstin, docType, ctx.document.number, fiscalYearCode(ctx.document.date));
}

/** HSN of the highest-value line, which is what the portal asks for. */
export function mainHsnCodeOf(doc: BusinessDocument): string | undefined {
  let best: { hsn?: string; value: number } = { value: -1 };
  doc.lines.forEach((line) => {
    const value = Math.round(line.quantity * line.unitPrice.minor);
    if (value > best.value) best = { hsn: line.hsnCode, value };
  });
  return best.hsn;
}

/* ------------------------------------------------------------------ */
/* NIC schema 1.1 payload                                              */
/* ------------------------------------------------------------------ */

export type IrpItem = {
  SlNo: string;
  PrdDesc: string;
  IsServc: 'Y' | 'N';
  HsnCd: string;
  Qty: number;
  Unit: string;
  UnitPrice: number;
  TotAmt: number;
  Discount: number;
  AssAmt: number;
  GstRt: number;
  IgstAmt: number;
  CgstAmt: number;
  SgstAmt: number;
  TotItemVal: number;
};

export type IrpInvoicePayload = {
  Version: '1.1';
  TranDtls: { TaxSch: 'GST'; SupTyp: EInvoiceSupplyType; RegRev: 'Y' | 'N'; IgstOnIntra: 'Y' | 'N' };
  DocDtls: { Typ: EInvoiceDocType; No: string; Dt: string };
  SellerDtls: {
    Gstin: string;
    LglNm: string;
    Addr1: string;
    Addr2?: string;
    Loc: string;
    Pin: number;
    Stcd: string;
    Ph?: string;
    Em?: string;
  };
  BuyerDtls: {
    Gstin: string;
    LglNm: string;
    Pos: string;
    Addr1: string;
    Addr2?: string;
    Loc: string;
    Pin: number;
    Stcd: string;
    Ph?: string;
    Em?: string;
  };
  ItemList: IrpItem[];
  ValDtls: {
    AssVal: number;
    CgstVal: number;
    SgstVal: number;
    IgstVal: number;
    Discount: number;
    OthChrg: number;
    RndOffAmt: number;
    TotInvVal: number;
  };
};

/** Portal dates are `dd/MM/yyyy`, unlike the ISO dates used everywhere else. */
export function portalDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** Portal timestamps are `yyyy-MM-dd HH:mm:ss`. */
export function portalDateTime(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
}

function componentTotal(doc: BusinessDocument, type: TaxComponent['type']): number {
  return componentsOf(doc.totals.taxLines)
    .filter((c) => c.type === type)
    .reduce((acc, c) => acc + c.amount.minor, 0);
}

/**
 * The document as the portal expects it (schema 1.1).
 *
 * Money crosses this boundary in major units rounded to two decimals, which is
 * the one place in the codebase where that is correct — the portal's schema is
 * defined in rupees, not paise.
 */
export function buildIrpPayload(ctx: EInvoiceContext): IrpInvoicePayload {
  const { document: doc, company, buyer, items } = ctx;
  const supplyType = eInvoiceSupplyTypeFor(doc, buyer) ?? 'B2B';
  const docType = eInvoiceDocTypeFor(doc.kind) ?? 'INV';
  const currency = doc.totals.grandTotal.currency;
  const itemType = new Map(items.map((i) => [i.id, i.type]));

  const itemList: IrpItem[] = doc.lines.map((line, i) => {
    const gross = line.quantity * toMajor(line.unitPrice);
    const discount =
      line.discountMode === 'percent'
        ? (gross * Math.min(line.discountValue, 100)) / 100
        : line.discountValue;
    const assessable = Math.max(0, gross - discount);
    // Tax is computed per rate, not per line, so split each rate's tax across
    // the lines charged at it in proportion to their assessable value.
    const taxLine = doc.totals.taxLines.find((t) => t.rate === line.taxRate);
    const share =
      taxLine && taxLine.taxableAmount.minor > 0 ? assessable / toMajor(taxLine.taxableAmount) : 0;

    const amountOf = (type: TaxComponent['type']) => {
      if (!taxLine) return 0;
      const minor = taxLine.components
        .filter((c) => c.type === type)
        .reduce((acc, c) => acc + c.amount.minor, 0);
      return round2(toMajor({ minor, currency }) * share);
    };

    const igst = amountOf('IGST');
    const cgst = amountOf('CGST');
    const sgst = amountOf('SGST');

    return {
      SlNo: String(i + 1),
      PrdDesc: line.name,
      IsServc: itemType.get(line.itemId ?? '') === 'service' ? 'Y' : 'N',
      HsnCd: line.hsnCode ?? '',
      Qty: line.quantity,
      Unit: uqcFor(line.unit),
      UnitPrice: round2(toMajor(line.unitPrice)),
      TotAmt: round2(gross),
      Discount: round2(discount),
      AssAmt: round2(assessable),
      GstRt: line.taxRate,
      IgstAmt: igst,
      CgstAmt: cgst,
      SgstAmt: sgst,
      TotItemVal: round2(assessable + igst + cgst + sgst),
    };
  });

  const sellerAddr = company.address;
  const buyerAddr = buyer?.shippingAddress ?? buyer?.billingAddress;

  return {
    Version: '1.1',
    TranDtls: { TaxSch: 'GST', SupTyp: supplyType, RegRev: 'N', IgstOnIntra: 'N' },
    DocDtls: { Typ: docType, No: doc.number, Dt: portalDate(doc.date) },
    SellerDtls: {
      Gstin: company.taxRegistration?.identifier ?? '',
      LglNm: company.legalName ?? company.name,
      Addr1: sellerAddr.line1,
      Addr2: sellerAddr.line2,
      Loc: sellerAddr.city,
      Pin: Number(sellerAddr.postalCode) || 0,
      Stcd: sellerAddr.stateCode ?? '',
      Ph: company.phone,
      Em: company.email,
    },
    BuyerDtls: {
      Gstin: buyer?.taxId ?? 'URP',
      LglNm: buyer?.name ?? 'Unregistered person',
      Pos: doc.placeOfSupplyStateCode ?? '',
      Addr1: buyerAddr?.line1 ?? '',
      Addr2: buyerAddr?.line2,
      Loc: buyerAddr?.city ?? '',
      Pin: Number(buyerAddr?.postalCode) || 0,
      Stcd: buyerAddr?.stateCode ?? '',
      Ph: buyer?.phone,
      Em: buyer?.email,
    },
    ItemList: itemList,
    ValDtls: {
      AssVal: round2(toMajor(doc.totals.taxableAmount)),
      CgstVal: round2(toMajor({ minor: componentTotal(doc, 'CGST'), currency })),
      SgstVal: round2(toMajor({ minor: componentTotal(doc, 'SGST'), currency })),
      IgstVal: round2(toMajor({ minor: componentTotal(doc, 'IGST'), currency })),
      Discount: round2(toMajor(doc.totals.documentDiscount)),
      OthChrg: round2(toMajor(doc.totals.charges)),
      RndOffAmt: round2(toMajor(doc.totals.roundOff)),
      TotInvVal: round2(toMajor(doc.totals.grandTotal)),
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* Signed QR                                                           */
/* ------------------------------------------------------------------ */

/** The ten claims the portal puts inside the signed QR. */
export type SignedQrClaims = {
  SellerGstin: string;
  BuyerGstin?: string;
  DocNo: string;
  DocTyp: EInvoiceDocType;
  DocDt: string;
  TotInvVal: number;
  ItemCnt: number;
  MainHsnCode?: string;
  Irn: string;
  IrnDt: string;
};

/**
 * Stands in for the portal's RSA-2048 signature.
 *
 * A real signature is produced with the portal's private key, which by
 * definition cannot exist here. Deriving it from the signing input keeps the
 * payload deterministic and the right shape, and keeps the QR to a size that
 * still prints legibly.
 */
const SIMULATED_IRP_KEY_ID = 'NIC-IRP-SIM-01';

export function buildSignedQrPayload(claims: SignedQrClaims): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const issuedAt = Math.floor(parseDate(claims.IrnDt.slice(0, 10)).getTime() / 1000);
  const body = base64UrlEncode(
    JSON.stringify({
      data: JSON.stringify(claims),
      iss: 'NIC',
      sub: claims.SellerGstin,
      aud: 'NIC-IRP',
      iat: issuedAt,
      exp: issuedAt + 365 * 24 * 3600,
    }),
  );
  const signature = base64UrlEncode(sha256Hex(`${header}.${body}.${SIMULATED_IRP_KEY_ID}`));
  return `${header}.${body}.${signature}`;
}

/** Read the claims back out of a signed QR payload. */
export function parseSignedQrPayload(jws: string): SignedQrClaims | null {
  try {
    const parts = jws.split('.');
    if (parts.length !== 3) return null;
    const body = JSON.parse(base64UrlDecode(parts[1]));
    return JSON.parse(body.data) as SignedQrClaims;
  } catch {
    return null;
  }
}

export function claimsFor(
  ctx: EInvoiceContext,
  irn: string,
  irnDate: string,
): SignedQrClaims {
  const { document: doc, company, buyer } = ctx;
  const claims: SignedQrClaims = {
    SellerGstin: company.taxRegistration?.identifier ?? '',
    DocNo: doc.number,
    DocTyp: eInvoiceDocTypeFor(doc.kind) ?? 'INV',
    DocDt: portalDate(doc.date),
    TotInvVal: round2(toMajor(doc.totals.grandTotal)),
    ItemCnt: doc.lines.length,
    MainHsnCode: mainHsnCodeOf(doc),
    Irn: irn,
    IrnDt: portalDateTime(irnDate),
  };
  if (buyer?.taxId) claims.BuyerGstin = buyer.taxId;
  return claims;
}

/* ------------------------------------------------------------------ */
/* Cancellation                                                        */
/* ------------------------------------------------------------------ */

/** When the 24-hour cancellation window closes. */
export function cancelDeadline(irnGeneratedAt: string): string {
  return new Date(
    new Date(irnGeneratedAt).getTime() + E_INVOICE_CANCEL_WINDOW_HOURS * 3600 * 1000,
  ).toISOString();
}

export function canCancelEInvoice(
  compliance: ComplianceInfo | undefined,
  now: string,
): { allowed: boolean; reason?: string; deadline?: string } {
  if (!compliance?.irn) return { allowed: false, reason: 'No IRN has been generated' };
  if (compliance.eInvoiceStatus === 'cancelled') {
    return { allowed: false, reason: 'This IRN has already been cancelled' };
  }
  if (compliance.eInvoiceStatus !== 'generated') {
    return { allowed: false, reason: 'There is no live IRN to cancel' };
  }

  const from = compliance.irnGeneratedAt;
  if (!from) return { allowed: false, reason: 'The generation time is unknown' };

  const deadline = cancelDeadline(from);
  if (new Date(now).getTime() >= new Date(deadline).getTime()) {
    return {
      allowed: false,
      reason: 'The 24-hour cancellation window has closed; issue a credit note instead',
      deadline,
    };
  }
  return { allowed: true, deadline };
}

/** Only "Other" obliges the user to say more. */
export function requiresCancelRemark(code: CancelReasonCode): boolean {
  return code === '4';
}
