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

export type ComplianceInfo = {
  eInvoiceStatus?: 'notApplicable' | 'pending' | 'generated' | 'failed';
  irn?: string;
  ewayBillStatus?: 'notApplicable' | 'pending' | 'generated' | 'failed';
  ewayBillNumber?: string;
  lastMessage?: string;
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
};
