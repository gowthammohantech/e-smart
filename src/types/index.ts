import { Money } from '@/lib/money';

/* ------------------------------------------------------------------ */
/* Tenancy: CustomerAccount -> Company -> Branch -> User  (FRD 2)      */
/* ------------------------------------------------------------------ */

export type Address = {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  /** GST state code, e.g. "27" for Maharashtra. Drives the CGST/SGST vs IGST split. */
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

/** Annual aggregate turnover band. e-Invoicing is mandatory from ₹5 crore upward. */
export type TurnoverSlab = 'under5cr' | '5crTo10cr' | '10crTo50cr' | 'over50cr';

export type TaxRegistration = {
  regime: 'GST' | 'NONE';
  /** GSTIN, 15 characters. */
  identifier?: string;
  identifierLabel: string;
  registered: boolean;
  compositionScheme?: boolean;
  /** Home state code — the state the business is registered in. */
  placeOfSupplyStateCode?: string;
  turnoverSlab?: TurnoverSlab;
  eInvoiceEnabled?: boolean;
  eWayBillEnabled?: boolean;
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

/* ------------------------------------------------------------------ */
/* Customers                                                           */
/* ------------------------------------------------------------------ */

/** How the buyer is registered under GST — decides the supply type on a sale. */
export type GstRegistrationType =
  | 'regular'
  | 'composition'
  | 'unregistered'
  | 'sez'
  | 'overseas';

export type Party = {
  id: string;
  companyId: string;
  name: string;
  code: string;
  displayName?: string;
  /** GSTIN for a registered buyer. */
  taxId?: string;
  gstRegistrationType: GstRegistrationType;
  email?: string;
  phone?: string;
  billingAddress: Address;
  shippingAddress?: Address;
  creditLimit?: Money;
  /** Positive opening balance means the customer owes us. */
  openingBalance: Money;
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
  taxCategoryId: string;
  /** HSN for goods, SAC for services. Mandatory on an e-invoice. */
  hsnCode?: string;
  imageUri?: string;
  status: 'active' | 'inactive';
  createdAt: string;
};

export type Unit = { id: string; code: string; name: string; decimals: number };

/* ------------------------------------------------------------------ */
/* Tax engine (FRD 15)                                                 */
/* ------------------------------------------------------------------ */

export type TaxType = 'GST' | 'CGST' | 'SGST' | 'IGST' | 'CESS' | 'NONE';

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
/* Documents                                                           */
/* ------------------------------------------------------------------ */

export type DocumentKind = 'quote' | 'salesOrder' | 'delivery' | 'invoice' | 'salesReturn';

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
  | 'processed';

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
  lines: DocumentLine[];
  documentDiscountMode: DiscountMode;
  documentDiscountValue: number;
  charges: Money;
  applyRoundOff: boolean;
  /** State code the supply is made to. Defaults from the shipping address. */
  placeOfSupplyStateCode?: string;
  /** Tax payable by the recipient instead of the supplier. */
  reverseCharge?: boolean;
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
/* GST compliance: e-invoice and e-way bill                            */
/* ------------------------------------------------------------------ */

/** An error as the IRP / NIC portal reports it: a numeric code and a message. */
export type IrpError = { code: string; message: string };

export type EInvoiceStatus =
  | 'notApplicable'
  | 'pending'
  | 'generated'
  | 'cancelled'
  | 'failed';

/** Cancellation reasons the IRP accepts, by code. */
export type EInvoiceCancelReason = '1' | '2' | '3' | '4';

export type EInvoiceRecord = {
  status: EInvoiceStatus;
  /** 64-character hash returned by the IRP. */
  irn?: string;
  ackNo?: string;
  ackDate?: string;
  /** The content the IRP signs into the QR code. */
  signedQrPayload?: string;
  generatedAt?: string;
  cancelledAt?: string;
  cancelReasonCode?: EInvoiceCancelReason;
  cancelRemarks?: string;
  errors?: IrpError[];
};

export type EWayBillStatus =
  | 'notApplicable'
  | 'pending'
  | 'generated'
  | 'cancelled'
  | 'expired'
  | 'failed';

/** 1 Road, 2 Rail, 3 Air, 4 Ship. */
export type TransportMode = '1' | '2' | '3' | '4';

/** R regular, O over-dimensional cargo. */
export type VehicleType = 'R' | 'O';

export type EwbSupplyType = 'O' | 'I';

export type EwbSubSupplyType =
  | '1' // Supply
  | '2' // Import
  | '3' // Export
  | '4' // Job work
  | '5' // For own use
  | '8' // Sales return
  | '12'; // Others

export type EwbPartA = {
  supplyType: EwbSupplyType;
  subSupplyType: EwbSubSupplyType;
  docType: 'INV' | 'CHL' | 'CRN';
  docNo: string;
  docDate: string;
  fromGstin: string;
  fromTradeName: string;
  fromAddress: string;
  fromPlace: string;
  fromPincode: string;
  fromStateCode: string;
  toGstin: string;
  toTradeName: string;
  toAddress: string;
  toPlace: string;
  toPincode: string;
  toStateCode: string;
  totalValue: number;
  cgstValue: number;
  sgstValue: number;
  igstValue: number;
  cessValue: number;
  totInvValue: number;
  itemList: {
    productName: string;
    hsnCode: string;
    quantity: number;
    unit: string;
    taxableAmount: number;
    taxRate: number;
  }[];
};

export type EwbPartB = {
  transMode: TransportMode;
  transporterId?: string;
  transporterName?: string;
  transDocNo?: string;
  transDocDate?: string;
  vehicleNo?: string;
  vehicleType: VehicleType;
};

export type EWayBillRecord = {
  status: EWayBillStatus;
  /** 12-digit e-way bill number. */
  ewbNo?: string;
  ewbDate?: string;
  validUpto?: string;
  distanceKm?: number;
  cargo?: 'regular' | 'odc';
  partA?: EwbPartA;
  partB?: EwbPartB;
  generatedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  errors?: IrpError[];
};

export type ComplianceInfo = {
  eInvoice?: EInvoiceRecord;
  eWayBill?: EWayBillRecord;
};

/** Transporter master, for the Part-B of an e-way bill. */
export type Transporter = {
  id: string;
  companyId: string;
  name: string;
  /** 15-character GSTIN or TRANSIN. */
  transporterId: string;
  phone?: string;
  status: 'active' | 'inactive';
};

/* ------------------------------------------------------------------ */
/* Payments (FRD 12)                                                   */
/* ------------------------------------------------------------------ */

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
  partyId: string;
  date: string;
  amount: Money;
  method: PaymentMethod;
  reference?: string;
  accountId: string;
  allocations: PaymentAllocation[];
  /** Unallocated part of the payment, held as an advance against the customer. */
  unallocated: Money;
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
  accountNumber?: string;
  openingBalance: Money;
  isDefault: boolean;
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
  | 'eInvoice'
  | 'eWayBill'
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
  kind: DocumentKind | 'payment';
  prefix: string;
  nextNumber: number;
  padding: number;
  includeFiscalYear: boolean;
  includeBranchCode: boolean;
  resetPolicy: 'never' | 'yearly' | 'monthly';
};

export type Integration = {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'payments' | 'compliance' | 'messaging' | 'accounting';
  connected: boolean;
};
