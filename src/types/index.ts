import { Money } from '@/lib/money';

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
  createdAt: string;
};

export type TaxRegistration = {
  regime: 'GST' | 'VAT' | 'NONE';
  identifier?: string;
  identifierLabel: string;
  registered: boolean;
  compositionScheme?: boolean;
  placeOfSupplyStateCode?: string;
};

export type Branch = {
  id: string;
  companyId: string;
  name: string;
  code: string;
  address: Address;
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

export type Party = {
  id: string;
  companyId: string;
  kind: PartyKind;
  name: string;
  code: string;
  displayName?: string;
  taxId?: string;
  email?: string;
  phone?: string;
  currency: string;
  billingAddress: Address;
  shippingAddress?: Address;
  creditLimit?: Money;
  openingBalance: Money;
  /** Positive opening balance means the party owes us (customer) / we owe them (supplier). */
  paymentTermsDays: number;
  notes?: string;
  status: 'active' | 'inactive';
  createdAt: string;
};

/* ------------------------------------------------------------------ */
/* Catalog                                                             */
/* ------------------------------------------------------------------ */

export type ItemType = 'goods' | 'service';

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
  openingStock: number;
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
  | 'purchaseReturn';

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
};

export type DocumentTotals = {
  subtotal: Money;
  lineDiscount: Money;
  documentDiscount: Money;
  taxableAmount: Money;
  taxLines: TaxLine[];
  totalTax: Money;
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
  currency: string;
  exchangeRate: number;
  lines: DocumentLine[];
  documentDiscountMode: DiscountMode;
  documentDiscountValue: number;
  charges: Money;
  applyRoundOff: boolean;
  placeOfSupplyStateCode?: string;
  notes?: string;
  terms?: string;
  attachmentIds: string[];
  /** Links between documents, e.g. invoice created from quote q_1. */
  sourceDocumentId?: string;
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
  irpUsername?: string;
  /** Held masked, e.g. `ELX-****-9F21`. Never a real credential. */
  irpClientIdMasked?: string;
  irpEnvironment: 'sandbox' | 'production';

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
  amount: Money;
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
  accountId: string;
  method: PaymentMethod;
  reference?: string;
  notes?: string;
  billable: boolean;
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
  kind: DocumentKind | 'payment' | 'expense';
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
};

export type Integration = {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'payments' | 'compliance' | 'messaging' | 'accounting' | 'storage';
  connected: boolean;
  /** Where the row links for configuration, when it has any. */
  configRoute?: string;
};
