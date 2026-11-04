import { Money } from '../lib/money';

/* ------------------------------------------------------------------ */
/* Tenancy: CustomerAccount -> Company -> Branch -> User  (FRD 2)      */
/* ------------------------------------------------------------------ */

export type Address = {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  stateCode?: string;
  postalCode: string;
  country: string;
};

/** Subscription tier. Free and Basic sell; Pro and Business run the whole business. */
export type PlanTier = 'free' | 'basic' | 'pro' | 'business';

export type Company = {
  id: string;
  accountId: string;
  name: string;
  legalName?: string;
  logoUri?: string;
  businessType: string;
  country: string;
  baseCurrency: string;
  address: Address;
  email?: string;
  phone?: string;
  website?: string;
  taxRegistration?: TaxRegistration;
  fiscalYearStartMonth: number;
  /** Books are closed up to and including this date. */
  lockedThroughDate?: string | null;
  /** Let sales take tracked items below zero. Off unless the business turns it on. */
  allowNegativeStock?: boolean;
  /** RBI's bank rate, percent, for MSME late-payment interest (three times it). 5.5 unless changed. */
  msmeBankRate?: number;
  /** Days apart a 2B line and a bill may be dated and still be claimed without a person. 3 unless changed. */
  gstr2bDateToleranceDays?: number;
  /** Tax deduction account number: with it the business deducts TDS on what it pays suppliers. */
  tan?: string;
  plan: PlanTier;
  createdAt: string;
};

export type TaxRegistration = {
  regime: 'GST' | 'VAT' | 'NONE';
  identifier?: string;
  identifierLabel: string;
  registered: boolean;
  compositionScheme?: boolean;
  placeOfSupplyStateCode?: string;
  /** Letter of Undertaking: exports under it are zero-rated (no IGST charged). */
  lutNumber?: string;
  /** ISO date the LUT runs to (a financial year). */
  lutValidTill?: string;
  /** How often GSTR-1 and GSTR-3B are filed. QRMP: quarterly returns, monthly payment. */
  returnFrequency?: ReturnFrequency;
};

export type ReturnFrequency = 'monthly' | 'qrmp';

export type Branch = {
  id: string;
  companyId: string;
  name: string;
  code: string;
  address: Address;
  /** Set when the branch holds its own GST registration (e.g. another state). */
  gstin?: string;
  isPrimary: boolean;
  phone?: string;
};

export type UserRole = 'owner' | 'admin' | 'accountant' | 'sales' | 'viewer';

export type User = {
  id: string;
  accountId: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  companyIds: string[];
  branchIds: string[];
  avatarColor: string;
  status: 'active' | 'invited' | 'disabled';
  lastActiveAt?: string;
};

export type DeviceSession = {
  id: string;
  label: string;
  platform: string;
  lastActiveAt: string;
  current: boolean;
  location?: string;
};

/* ------------------------------------------------------------------ */
/* Parties                                                             */
/* ------------------------------------------------------------------ */

export type PartyKind = 'customer' | 'supplier';

/** A carrier saved for Part-B of an e-way bill. */
export type Transporter = {
  id: string;
  companyId: string;
  name: string;
  /** 15-character GSTIN, or a TRANSIN for an unregistered carrier. */
  transporterId: string;
  phone?: string;
  status: 'active' | 'inactive';
};

export type GstRegistrationType = 'regular' | 'composition' | 'unregistered' | 'sez' | 'overseas';

/** Udyam category of an MSME supplier: their bills must be paid within 45 days (MSMED Act s.15). */
export type MsmeType = 'micro' | 'small' | 'medium';

export type Party = {
  id: string;
  companyId: string;
  kind: PartyKind;
  name: string;
  code: string;
  displayName?: string;
  taxId?: string;
  /** How the buyer is registered for GST. Unset reads as regular when there is a GSTIN, else unregistered. */
  gstRegistrationType?: GstRegistrationType;
  /** Income-tax PAN. Read from the GSTIN (characters 3 to 12) when not given. */
  pan?: string;
  /** Supplier's MSME (Udyam) category, if registered. */
  msmeType?: MsmeType;
  udyamNumber?: string;
  /** Bills from this supplier are under reverse charge unless a line says otherwise. */
  reverseCharge?: boolean;
  /** The TDS section their bills fall under by default (194C, 194J(b)…). */
  tdsSection?: string;
  /** A lower or nil deduction certificate they hold (s.197). */
  lowerTdsCertificate?: { rate: number; validTill: string };
  email?: string;
  phone?: string;
  currency: string;
  billingAddress: Address;
  shippingAddress?: Address;
  creditLimit?: Money;
  openingBalance: Money;
  /** Positive opening balance means the party owes us (customer) / we owe them (supplier). */
  /** The day the opening balance stands at (ISO date). Unset reads as the start of the books. */
  openingBalanceDate?: string;
  paymentTermsDays: number;
  notes?: string;
  status: 'active' | 'inactive';
  createdAt: string;
};

/* ------------------------------------------------------------------ */
/* Catalog                                                             */
/* ------------------------------------------------------------------ */

export type ItemType = 'goods' | 'service';

/**
 * How GST treats a supply. Nil-rated (0% in the schedule), exempt (s.11 notification) and
 * non-GST (outside the Act: petrol, alcohol for consumption) are each reported separately.
 */
export type SupplyType = 'taxable' | 'nil' | 'exempt' | 'nonGst';

/** Whether GST paid on a purchase can be claimed as input tax credit. */
export type ItcEligibility = 'eligible' | 'blocked' | 'ineligible';

/** The GST treatment of an item, also kept on each document line as it was when used. */
export type GstFlags = {
  /** Unset reads as taxable. */
  supplyType?: SupplyType;
  /** Recovered from the customer at cost as their pure agent (Rule 33): outside the taxable value. */
  reimbursement?: boolean;
  /** Machinery and other assets: their credit is reported separately. */
  capitalGoods?: boolean;
  /** Unset reads as eligible. `blocked` is s.17(5): food, personal vehicles, works contracts and so on. */
  itcEligibility?: ItcEligibility;
  /** A notified reverse-charge supply (GTA, legal, security): the buyer pays the GST. */
  reverseCharge?: boolean;
  /** Compensation cess, percent of the taxable value. */
  cessRate?: number;
};

export type Item = {
  id: string;
  companyId: string;
  sku: string;
  name: string;
  description?: string;
  type: ItemType;
  unit: string;
  salePrice: Money;
  purchasePrice: Money;
  taxCategoryId: string;
  hsnCode?: string;
  barcode?: string;
  trackInventory: boolean;
  /** GST treatment; see GstFlags. */
  gst?: GstFlags;
  openingStock: number;
  /** The day the opening stock was counted (ISO date, not after today). No document with the item is dated before it. */
  openingStockDate?: string;
  reorderLevel: number;
  imageUri?: string;
  status: 'active' | 'inactive';
  createdAt: string;
};

export type Unit = { id: string; code: string; name: string; decimals: number };

/* ------------------------------------------------------------------ */
/* Tax engine (FRD 15)                                                 */
/* ------------------------------------------------------------------ */

export type TaxType = 'GST' | 'CGST' | 'SGST' | 'IGST' | 'VAT' | 'CESS' | 'NONE';

export type TaxCategory = {
  id: string;
  companyId: string;
  name: string;
  /** Combined percentage, split into components at calculation time. */
  rate: number;
  type: TaxType;
  hsnCode?: string;
  effectiveFrom: string;
  description?: string;
};

export type TaxComponent = {
  type: TaxType;
  label: string;
  rate: number;
  amount: Money;
};

export type TaxLine = {
  categoryId: string;
  categoryName: string;
  rate: number;
  /** Tax the buyer pays under reverse charge: shown, but not part of the total. */
  reverseCharge?: boolean;
  taxableAmount: Money;
  components: TaxComponent[];
  totalTax: Money;
};

/* ------------------------------------------------------------------ */
/* Currency (FRD 6)                                                    */
/* ------------------------------------------------------------------ */

export type ExchangeRate = {
  id: string;
  companyId: string;
  from: string;
  to: string;
  rate: number;
  effectiveFrom: string;
  source: 'manual' | 'provider';
};

/* ------------------------------------------------------------------ */
/* Documents                                                           */
/* ------------------------------------------------------------------ */

export type DocumentKind =
  | 'quote'
  | 'salesOrder'
  | 'delivery'
  | 'invoice'
  | 'salesReturn'
  | 'purchaseOrder'
  | 'goodsReceipt'
  | 'purchaseBill'
  | 'purchaseReturn'
  /** Lowers what an invoice charged, with no goods coming back: a discount or a price correction. */
  | 'creditNote'
  /** Adds to what an invoice charged: a price increase or tax short-billed. */
  | 'debitNote'
  /** A supplier's credit note against their bill. */
  | 'supplierCreditNote'
  /** A supplier's debit note: more owed on their bill. */
  | 'supplierDebitNote';

/** Why a credit or debit note was raised, as GSTR-1 and the e-invoice describe it. */
export type NoteReason = 'discount' | 'priceChange' | 'taxCorrection' | 'deficiency' | 'other';

export type DocStatus =
  | 'draft'
  | 'sent'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'confirmed'
  | 'fulfilled'
  | 'cancelled'
  | 'delivered'
  | 'issued'
  | 'partiallyPaid'
  | 'paid'
  | 'overdue'
  | 'requested'
  | 'approved'
  | 'processed'
  | 'received'
  | 'billed';

export type DiscountMode = 'percent' | 'amount';

export type DocumentLine = {
  id: string;
  itemId?: string;
  name: string;
  description?: string;
  hsnCode?: string;
  quantity: number;
  unit: string;
  unitPrice: Money;
  discountMode: DiscountMode;
  discountValue: number;
  taxCategoryId: string;
  /** Snapshot of the rate applied, so historical docs stay reproducible. */
  taxRate: number;
  taxInclusive: boolean;
  /** The item's GST treatment when the line was written; see GstFlags. */
  gst?: GstFlags;
  /** A reimbursement line: the billable expense it recovers from the customer. */
  expenseId?: string;
};

export type DocumentTotals = {
  subtotal: Money;
  lineDiscount: Money;
  documentDiscount: Money;
  taxableAmount: Money;
  taxLines: TaxLine[];
  /** Tax charged on the document, cess included; reverse-charge tax is not. */
  totalTax: Money;
  /** Tax the buyer owes the government under reverse charge. Not in the grand total. Absent on older documents. */
  reverseChargeTax?: Money;
  /** Pure-agent reimbursements, added after tax and outside the taxable value. Absent on older documents. */
  reimbursements?: Money;
  charges: Money;
  roundOff: Money;
  grandTotal: Money;
  /** Grand total converted into the company base currency at the stored rate. */
  grandTotalBase: Money;
};

export type BusinessDocument = {
  id: string;
  companyId: string;
  branchId: string;
  kind: DocumentKind;
  number: string;
  status: DocStatus;
  partyId: string;
  date: string;
  dueDate?: string;
  validUntil?: string;
  reference?: string;
  /** Supplier's own bill number on purchase documents. */
  supplierDocNumber?: string;
  /** An import bill's bill of entry, with the IGST and cess paid at customs (base currency). */
  billOfEntry?: { number: string; date: string; portCode: string; assessableValue: Money; igst: Money; cess?: Money };
  /** An Input Service Distributor's invoice: its credit is 3B 4A(4). */
  isdInvoice?: boolean;
  currency: string;
  exchangeRate: number;
  lines: DocumentLine[];
  documentDiscountMode: DiscountMode;
  documentDiscountValue: number;
  charges: Money;
  applyRoundOff: boolean;
  /**
   * A round-off typed by the user (may be negative). Absent means the
   * adjustment is computed automatically to the nearest whole unit.
   */
  roundOffManual?: Money;
  placeOfSupplyStateCode?: string;
  /** The whole document is under reverse charge: the buyer pays the GST. */
  reverseCharge?: boolean;
  /** The party's GSTIN and state when the document was finalised, as the returns need them. */
  partyGstin?: string;
  partyStateCode?: string;
  notes?: string;
  terms?: string;
  attachmentIds: string[];
  /** Links between documents, e.g. invoice created from quote q_1. */
  sourceDocumentId?: string;
  /** Why a credit or debit note was raised. */
  noteReason?: NoteReason;
  /** The TDS section asked for on a supplier's bill: a code, `none`, or unset for the supplier's own. */
  tdsSection?: string;
  /** TDS the business deducted on a supplier's bill: what's paid them is the total less this. */
  tds?: { section: string; rate: number; amount: Money };
  /** The self-invoice raised for a reverse-charge purchase from an unregistered supplier (Rule 46(f)). */
  selfInvoiceNumber?: string;
  /** Input tax credit reversed because the bill went unpaid for 180 days, and claimed again once paid. */
  itcReversedOn?: string;
  itcReclaimedOn?: string;
  /** The GSTR-2B period (MMYYYY) whose line this bill matched: its credit is claimed in that return. */
  itcClaimPeriod?: string;
  /** The project or department it belongs to. */
  costCentreId?: string;
  totals: DocumentTotals;
  compliance?: ComplianceInfo;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

/* ------------------------------------------------------------------ */
/* Compliance: GST e-invoice (FRD 16)                                  */
/* ------------------------------------------------------------------ */

export type EInvoiceStatus =
  | 'notApplicable'
  | 'pending'
  | 'generated'
  | 'cancelled'
  | 'failed';

/** NIC document types the Invoice Registration Portal accepts. */
export type EInvoiceDocType = 'INV' | 'CRN' | 'DBN';

/** NIC supply types, TranDtls.SupTyp in schema 1.1. */
export type EInvoiceSupplyType = 'B2B' | 'SEZWP' | 'SEZWOP' | 'EXPWP' | 'EXPWOP' | 'DEXP';

/** The four reason codes the portal accepts on cancellation. */
export type CancelReasonCode = '1' | '2' | '3' | '4';

/**
 * One finding from a compliance check. `code` mirrors the NIC error catalogue
 * where one exists, so the validation engine and the simulated portal speak the
 * same language.
 */
export type ComplianceIssue = {
  code: string;
  /** Dotted path into the document, e.g. `lines[2].hsnCode`. */
  field: string;
  message: string;
  severity: 'blocking' | 'warning';
};

/** How a document's e-way bill stands, mirrored from the `EwayBill` entity. */
export type DocumentEwayStatus =
  | 'notApplicable'
  | 'notRequired'
  | 'pending'
  | 'generated'
  | 'cancelled'
  | 'expired';

export type ComplianceInfo = {
  /* e-invoice */
  eInvoiceStatus?: EInvoiceStatus;
  eInvoiceDocType?: EInvoiceDocType;
  eInvoiceSupplyType?: EInvoiceSupplyType;
  /** 64-character lowercase hex digest returned by the portal. */
  irn?: string;
  /** 16-digit acknowledgement number. */
  ackNo?: string;
  /** Portal acknowledgement time, `yyyy-MM-dd HH:mm:ss` as it is returned. */
  ackDate?: string;
  /** JWS compact serialisation, rendered into the QR printed on the invoice. */
  signedQrPayload?: string;
  irnGeneratedAt?: string;
  irnCancelledAt?: string;
  irnCancelReasonCode?: CancelReasonCode;
  irnCancelRemark?: string;
  /** Findings from the last generation attempt, blocking and advisory. */
  eInvoiceIssues?: ComplianceIssue[];

  /**
   * Denormalised view of the latest e-way bill, so document rows and the
   * printed invoice do not have to reach across into `ewayBills`. The entity
   * remains the source of truth; both are written by the same store action.
   */
  ewayBillStatus?: DocumentEwayStatus;
  ewayBillId?: string;
  ewayBillNumber?: string;
  ewayBillValidUpto?: string;

  lastMessage?: string;
  lastAttemptAt?: string;
};

/* ------------------------------------------------------------------ */
/* Compliance: e-way bill (FRD 16)                                     */
/* ------------------------------------------------------------------ */

/** NIC transport modes 1 to 4. */
export type TransportMode = 'road' | 'rail' | 'air' | 'ship';

/** Regular cargo or over-dimensional cargo. Drives the km-per-day rate. */
export type VehicleType = 'regular' | 'overDimensional';

export type EwaySupplyType = 'outward' | 'inward';

export type EwaySubSupplyType =
  | 'supply'
  | 'export'
  | 'jobWork'
  | 'ownUse'
  | 'jobWorkReturn'
  | 'salesReturn'
  | 'exhibition'
  | 'lineSales'
  | 'recipientNotKnown'
  | 'others';

export type EwayDocType = 'INV' | 'BIL' | 'BOE' | 'CHL' | 'CNT' | 'OTH';

/** What is persisted. `expired` is never stored — it is derived from the clock. */
export type EwayBillStoredStatus = 'active' | 'cancelled';

/** What the interface shows, via `ewayBillStatusAt(bill, now)`. */
export type EwayBillStatus = 'active' | 'expired' | 'cancelled';

/** 1 natural calamity, 2 law and order, 3 transhipment, 4 accident, 5 other. */
export type EwayExtendReasonCode = '1' | '2' | '3' | '4' | '5';

/** 1 first time, 2 vehicle breakdown, 3 transhipment, 4 others. */
export type EwayPartBReasonCode = '1' | '2' | '3' | '4';

/** One end of the consignment, as Part-A records it. */
export type EwayPlace = {
  legalName: string;
  /** A GSTIN, or the literal `URP` for an unregistered person. */
  gstin: string;
  address1: string;
  address2?: string;
  place: string;
  pincode: string;
  stateCode: string;
};

export type EwayBillPartBUpdate = {
  id: string;
  mode: TransportMode;
  vehicleNumber?: string;
  vehicleType: VehicleType;
  transportDocNumber?: string;
  transportDocDate?: string;
  /** Where this leg of the journey starts. */
  fromPlace: string;
  fromStateCode: string;
  reasonCode: EwayPartBReasonCode;
  remark?: string;
  updatedAt: string;
  updatedBy: string;
};

export type EwayBillExtension = {
  id: string;
  extendedAt: string;
  extendedBy: string;
  reasonCode: EwayExtendReasonCode;
  remark?: string;
  transitType: 'inTransit' | 'inMovement';
  currentPlace: string;
  currentPincode: string;
  currentStateCode: string;
  /** Distance still to cover; the fresh validity is computed from this. */
  remainingDistanceKm: number;
  previousValidUpto: string;
  newValidUpto: string;
};

/**
 * An e-way bill is its own record rather than a field on the document: it
 * carries a number the portal issues, a validity window of its own, an
 * append-only Part-B history, extensions and a cancellation window that runs
 * from its own generation. One document can also need several over time, since
 * cancel-and-regenerate is routine when a vehicle or a distance turns out wrong.
 */
export type EwayBill = {
  id: string;
  companyId: string;
  branchId: string;
  /** The 12-digit number issued by the e-way bill portal. */
  ewayBillNumber: string;

  /* Part-A: the document the consignment moves under */
  documentId: string;
  documentKind: DocumentKind;
  documentNumber: string;
  documentDate: string;
  /** The counterparty, carried so a register row needs no document lookup. */
  partyId: string;
  docType: EwayDocType;
  supplyType: EwaySupplyType;
  subSupplyType: EwaySubSupplyType;
  /** Free text, required when the sub-supply type is `others`. */
  subSupplyDescription?: string;
  /** 1 regular, 2 bill-to ship-to, 3 bill-from dispatch-from, 4 combination. */
  transactionType: 1 | 2 | 3 | 4;

  from: EwayPlace;
  to: EwayPlace;

  /** Value of the consignment including tax, as printed on the document. */
  consignmentValue: Money;
  taxableValue: Money;
  cgst: Money;
  sgst: Money;
  igst: Money;
  /** HSN of the highest-value line, which is what the portal asks for. */
  mainHsnCode?: string;
  itemCount: number;

  /* Part-B: transport */
  transporterId?: string;
  transporterName?: string;
  transportMode: TransportMode;
  vehicleNumber?: string;
  vehicleType: VehicleType;
  transportDocNumber?: string;
  transportDocDate?: string;
  /** Approximate road distance in kilometres, which drives validity. */
  distanceKm: number;

  /* Lifecycle */
  generatedAt: string;
  generatedBy: string;
  validFrom: string;
  /** The last instant of validity — end of day, per rule 138(10). */
  validUpto: string;
  status: EwayBillStoredStatus;
  cancelledAt?: string;
  cancelReasonCode?: CancelReasonCode;
  cancelRemark?: string;

  partBUpdates: EwayBillPartBUpdate[];
  extensions: EwayBillExtension[];

  createdAt: string;
  updatedAt: string;
};

/* ------------------------------------------------------------------ */
/* Compliance settings (FRD 16)                                        */
/* ------------------------------------------------------------------ */

/**
 * Per-company compliance configuration. Held as its own record rather than on
 * `Company`, because `saveCompany` replaces the whole object from the profile
 * form and would otherwise clobber this on an unrelated edit.
 */
export type ComplianceSettings = {
  companyId: string;

  /* e-invoice */
  eInvoiceEnabled: boolean;
  /** Aggregate annual turnover the business has declared. */
  annualTurnover: Money;
  /** Turnover at or above which e-invoicing is mandatory. */
  eInvoiceTurnoverThreshold: Money;
  /** Days from the document date within which the portal still accepts it. */
  reportingWindowDays: number;
  autoGenerateEInvoiceOnFinalise: boolean;
  /** The e-invoice (IRP) portal username. */
  irpUsername?: string;
  /** The e-way bill portal username; it can differ from the IRP one. */
  ewbUsername?: string;
  /** Held masked, e.g. `ELX-****-9F21`. Never a real credential. */
  irpClientIdMasked?: string;

  /* e-way bill */
  ewayBillEnabled: boolean;
  /** Consignment value that must be exceeded before a bill is required. */
  ewayBillThreshold: Money;
  autoGenerateEwayBillOnFinalise: boolean;
  defaultTransporterId?: string;
  defaultTransporterName?: string;
  defaultDistanceKm: number;
  defaultTransportMode: TransportMode;
  defaultVehicleType: VehicleType;

  updatedAt: string;
};

/* ------------------------------------------------------------------ */
/* Payments (FRD 12)                                                   */
/* ------------------------------------------------------------------ */

export type PaymentDirection = 'received' | 'paid';

export type PaymentMethod = 'cash' | 'bank' | 'upi' | 'card' | 'cheque' | 'wallet' | 'other';

export type PaymentAllocation = {
  documentId: string;
  documentNumber: string;
  /** The server's: what kind the document is, so it opens as itself. */
  documentKind?: DocumentKind;
  /** Cash: what the payment itself settles. */
  amount: Money;
  /** Settled without cash: TDS the customer deducted (or the business deducted from a supplier). */
  tdsDeducted?: Money;
  /** Settled without cash: a discount allowed for prompt or short payment. */
  discount?: Money;
  /** Settled without cash: the rest written off as bad debt. */
  writeOff?: Money;
};

export type Payment = {
  id: string;
  companyId: string;
  branchId: string;
  number: string;
  direction: PaymentDirection;
  partyId: string;
  date: string;
  amount: Money;
  currency: string;
  exchangeRate: number;
  method: PaymentMethod;
  reference?: string;
  accountId: string;
  allocations: PaymentAllocation[];
  /** Unallocated part of the payment, held as an advance against the party. */
  unallocated: Money;
  fxGainLoss?: Money;
  /**
   * An advance received for services carries GST when received (s.13(2)): the rate and place of
   * supply it is taxed at. Advances for goods carry none (notification 66/2017).
   */
  advanceTax?: { taxCategoryId: string; rate: number; placeOfSupplyStateCode: string };
  /** On money paid: the TDS section of what its allocations kept back (26Q). */
  tdsSection?: string;
  /** Money paid back to a customer: the advance receipt it refunds (CGST Rule 51). */
  refundOf?: string;
  /** On an advance receipt: what has been paid back out of it, and when. */
  refunds?: { paymentId: string; number?: string; date: string; amount: Money }[];
  notes?: string;
  attachmentIds: string[];
  createdBy: string;
  createdAt: string;
};

export type PaymentAccount = {
  id: string;
  companyId: string;
  name: string;
  type: 'cash' | 'bank' | 'wallet';
  currency: string;
  accountNumber?: string;
  openingBalance: Money;
  /** The day the opening balance was counted (ISO date, not after today). */
  openingBalanceDate?: string;
  /** A foreign-currency account: the opening balance's rate to base on that day (1 in base currency). */
  openingRate?: number;
  isDefault: boolean;
};

/* ------------------------------------------------------------------ */
/* Expenses (FRD 14)                                                   */
/* ------------------------------------------------------------------ */

export type ExpenseCategory = {
  id: string;
  companyId: string;
  name: string;
  icon: string;
  color: string;
};

export type RecurrenceFrequency = 'none' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export type Expense = {
  id: string;
  companyId: string;
  branchId: string;
  number: string;
  categoryId: string;
  supplierId?: string;
  date: string;
  amount: Money;
  currency: string;
  exchangeRate: number;
  taxCategoryId?: string;
  taxAmount: Money;
  taxInclusive: boolean;
  /** Where the supply was received; decides CGST+SGST or IGST. Unset reads as the company's state. */
  placeOfSupplyStateCode?: string;
  /** The supplier's GSTIN on the bill, when there's no saved supplier. */
  supplierGstin?: string;
  /** Unset reads as eligible. */
  itcEligibility?: ItcEligibility;
  /** GST paid by the business itself under reverse charge; `taxAmount` is then not paid to the supplier. */
  reverseCharge?: boolean;
  accountId: string;
  method: PaymentMethod;
  reference?: string;
  notes?: string;
  billable: boolean;
  /** Billable: the customer it is recovered from. */
  customerId?: string;
  costCentreId?: string;
  recurrence: RecurrenceFrequency;
  nextRecurrenceDate?: string;
  attachmentIds: string[];
  createdBy: string;
  createdAt: string;
};

/* ------------------------------------------------------------------ */
/* Inventory (FRD 13)                                                  */
/* ------------------------------------------------------------------ */

export type StockMovementType =
  | 'opening'
  | 'purchaseReceipt'
  | 'salesIssue'
  | 'salesReturn'
  | 'purchaseReturn'
  | 'transferIn'
  | 'transferOut'
  | 'adjustment';

export type StockMovement = {
  id: string;
  companyId: string;
  branchId: string;
  itemId: string;
  type: StockMovementType;
  quantity: number;
  unitCost: Money;
  date: string;
  referenceId?: string;
  referenceNumber?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
};

/* ------------------------------------------------------------------ */
/* Supporting records                                                  */
/* ------------------------------------------------------------------ */

export type Attachment = {
  id: string;
  companyId: string;
  name: string;
  mimeType: string;
  size: number;
  uri: string;
  entityType?: string;
  entityId?: string;
  uploadedAt: string;
};

export type NotificationKind =
  | 'invoiceSent'
  | 'paymentReceived'
  | 'invoiceOverdue'
  | 'lowStock'
  | 'compliance'
  | 'syncFailure'
  | 'system';

export type AppNotification = {
  id: string;
  companyId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  read: boolean;
  createdAt: string;
};

export type AuditEvent = {
  id: string;
  companyId: string;
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  before?: string;
  after?: string;
  device?: string;
  createdAt: string;
};

export type NumberingSeries = {
  id: string;
  companyId: string;
  kind: DocumentKind | 'payment' | 'expense' | 'selfInvoice' | VoucherKind;
  prefix: string;
  nextNumber: number;
  padding: number;
  includeFiscalYear: boolean;
  includeBranchCode: boolean;
  resetPolicy: 'never' | 'yearly' | 'monthly';
};

export type SyncStatus = 'synced' | 'pending' | 'failed' | 'offline';

export type SyncQueueEntry = {
  id: string;
  label: string;
  entityType: string;
  entityId: string;
  action: string;
  status: SyncStatus;
  attempts: number;
  lastError?: string;
  queuedAt: string;
  /*
   * The API mutation the entry stands for (remote mode). The prototype's
   * seeded entries have none. The shape is the contract's SyncMutation.
   */
  method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path?: string;
  body?: unknown;
  /** Set when first sent. The server may have applied it since, so its body no longer changes. */
  sentAt?: string;
  /** The server version the change was made against; a stale one is a conflict. */
  baseVersion?: number;
  /** An id minted offline, which the server maps to its own on create. */
  clientEntityId?: string;
  /** The server's copy when the change conflicted, for the Sync screen. */
  conflict?: unknown;
};

export type Integration = {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'payments' | 'compliance' | 'messaging' | 'accounting' | 'storage';
  connected: boolean;
  /** False while it's coming soon: it can't be switched on yet. Absent means available. */
  available?: boolean;
  /** Where the row links for configuration, when it has any. */
  configRoute?: string;
};

/* ------------------------------------------------------------------ */
/* Books: the general ledger                                           */
/* ------------------------------------------------------------------ */

/** The groups every account sits in, as Tally lays out a chart of accounts. */
export type LedgerGroup =
  | 'capital'
  | 'reserves'
  | 'loans'
  | 'sundryCreditors'
  | 'dutiesTaxes'
  | 'provisions'
  | 'currentLiabilities'
  | 'fixedAssets'
  | 'investments'
  | 'sundryDebtors'
  | 'cashInHand'
  | 'bankAccounts'
  | 'stockInHand'
  | 'loansAdvances'
  | 'currentAssets'
  | 'salesAccounts'
  | 'directIncomes'
  | 'indirectIncomes'
  | 'purchaseAccounts'
  | 'directExpenses'
  | 'indirectExpenses';

/** An account a business adds itself: rent, a loan, a fixed asset. The rest are derived. */
export type LedgerAccount = {
  id: string;
  companyId: string;
  name: string;
  group: LedgerGroup;
  /** Opening balance, debit positive, as of the day the books start. */
  openingBalance: Money;
  /** The day the opening balance stands at (ISO date). Unset reads as the start of the books. */
  openingBalanceDate?: string;
  status: 'active' | 'inactive';
  createdAt: string;
};

/** A project, department or the like, that income and costs can be tagged with. */
export type CostCentre = {
  id: string;
  companyId: string;
  name: string;
  /** What kind of centre: "Project", "Department"… */
  category?: string;
  parentId?: string;
  status: 'active' | 'inactive';
  createdAt: string;
};

/** Journal: any adjustment. Contra: money between cash and bank. GST journal: adjustments to the GST ledgers. TDS challan: TDS paid to the government. */
/** `receipt`: money in that isn't from a customer's invoice: interest, rent, a refund, capital brought in. */
export type VoucherKind = 'journal' | 'contra' | 'gstJournal' | 'tdsChallan' | 'receipt';

/** Where a TDS challan was deposited, as printed on it (ITNS 281). */
export type TdsChallan = { bsrCode: string; serial: string; depositedOn: string };

export type VoucherLine = {
  /** An account key: `sys:sales`, `party:<id>`, `pay:<id>`, `exp:<id>`, `acc:<id>`, `sys:tdsPayable:194C`. */
  account: string;
  debit: Money;
  credit: Money;
  narration?: string;
  costCentreId?: string;
};

export type Voucher = {
  id: string;
  companyId: string;
  branchId: string;
  kind: VoucherKind;
  number: string;
  date: string;
  narration?: string;
  /** TDS challan: the challan's number and BSR code. */
  reference?: string;
  /** A TDS challan's deposit details. */
  challan?: TdsChallan;
  lines: VoucherLine[];
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
};
