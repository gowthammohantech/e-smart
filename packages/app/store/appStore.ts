import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CustomField } from '@esmart/core/domain/customFields';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  Attachment,
  AuditEvent,
  AppNotification,
  Branch,
  BusinessDocument,
  Company,
  PlanTier,
  Transporter,
  ComplianceIssue,
  ComplianceSettings,
  DeviceSession,
  DocStatus,
  DocumentKind,
  SeriesDocumentKind,
  DocumentLine,
  EwayBill,
  EwayExtendReasonCode,
  EwayPlace,
  EwaySubSupplyType,
  ExchangeRate,
  Expense,
  ExpenseCategory,
  Integration,
  ItemCategory,
  Brand,
  Vehicle,
  VoucherTemplate,
  Item,
  NotificationKind,
  NumberingSeries,
  Party,
  Payment,
  PaymentAccount,
  PaymentDirection,
  StockMovement,
  SyncQueueEntry,
  TaxCategory,
  TransportMode,
  User,
  VehicleType,
  LedgerAccount,
  CostCentre,
  Voucher,
} from '@esmart/core/types';
import { Money, zero } from '@esmart/core/lib/money';
import { nowISO, today } from '@esmart/core/lib/date';
import { uid } from '@esmart/core/lib/id';
import { calculateDocument } from '@esmart/core/domain/lineCalc';
import { DEFAULT_PREFIXES, SERIES_KINDS, formatNumber } from '@esmart/core/domain/numbering';
import { CREDIT_KINDS, PURCHASE_KINDS, conversionBlock, initialStatus, isFinalized, isPayableDocument } from '@esmart/core/domain/documentStates';
import { documentAuditSnapshot } from '@esmart/core/domain/auditDiff';
import { LEGACY_BUSINESS_TYPE_LABELS, expenseCategories as defaultExpenseCategories } from '@esmart/core/data/masters';
import { allocateAdvances, creditedTo, settledBy, statusForOutstanding } from '@esmart/core/domain/receivables';
import { tdsForDocument } from './tds';
import { accountFitsMethod } from '@esmart/core/domain/paymentAccounts';
import { applyProfileLocks } from '@esmart/core/domain/companyLock';
import { buildTaxContext } from '@esmart/core/domain/taxEngine';
import { createBookStorage } from './bookStorage';
import { bookBackend } from './bookBackend';
import { reportError } from '../lib/reporter';
import { i18nInstance } from '@esmart/i18n';
import { useRemoteMeta } from '../remote/meta';

export type AppData = {
  accountId: string;
  users: User[];
  devices: DeviceSession[];
  companies: Company[];
  branches: Branch[];
  parties: Party[];
  items: Item[];
  taxCategories: TaxCategory[];
  expenseCategories: ExpenseCategory[];
  /** The catalogue's own groupings: an item may have one category and one brand. */
  itemCategories: ItemCategory[];
  brands: Brand[];
  /** The company's own fields on contacts, items and documents. */
  customFields: CustomField[];
  vehicles: Vehicle[];
  voucherTemplates: VoucherTemplate[];
  paymentAccounts: PaymentAccount[];
  exchangeRates: ExchangeRate[];
  numberingSeries: NumberingSeries[];
  documents: BusinessDocument[];
  payments: Payment[];
  expenses: Expense[];
  /** The books: accounts the business added, and journal and contra vouchers. */
  ledgerAccounts: LedgerAccount[];
  vouchers: Voucher[];
  /** Projects, departments and the like, for profit by cost centre. */
  costCentres: CostCentre[];
  stockMovements: StockMovement[];
  attachments: Attachment[];
  notifications: AppNotification[];
  auditEvents: AuditEvent[];
  syncQueue: SyncQueueEntry[];
  integrations: Integration[];
  complianceSettings: ComplianceSettings[];
  ewayBills: EwayBill[];
  transporters: Transporter[];
};

export type Session = {
  userId: string | null;
  authenticated: boolean;
  onboardingComplete: boolean;
  signedInAt?: string;
};

/** The store starts empty: everything arrives from the API on sign-in. */
export function emptyData(): AppData {
  return {
    accountId: '',
    users: [],
    devices: [],
    companies: [],
    branches: [],
    parties: [],
    items: [],
    taxCategories: [],
    expenseCategories: [],
    itemCategories: [],
    brands: [],
    customFields: [],
    vehicles: [],
    voucherTemplates: [],
    paymentAccounts: [],
    exchangeRates: [],
    numberingSeries: [],
    documents: [],
    payments: [],
    expenses: [],
    ledgerAccounts: [],
    vouchers: [],
    costCentres: [],
    stockMovements: [],
    attachments: [],
    notifications: [],
    auditEvents: [],
    syncQueue: [],
    integrations: [],
    complianceSettings: [],
    ewayBills: [],
    transporters: [],
  };
}

type Actions = {
  /* session: signing in goes through remote/session */
  signOut: () => void;
  completeOnboarding: () => void;
  revokeDevice: (id: string) => void;

  /* company */
  setActiveCompany: (companyId: string) => void;
  setActiveBranch: (branchId: string) => void;
  saveCompany: (company: Company) => void;
  setPlan: (companyId: string, plan: PlanTier) => void;
  createCompany: (partial: Omit<Company, 'id' | 'accountId' | 'createdAt'>) => string;
  saveBranch: (branch: Branch) => void;
  removeBranch: (id: string) => void;
  saveUser: (user: User) => void;
  removeUser: (id: string) => void;

  /* masters */
  saveParty: (party: Party) => string;
  removeParty: (id: string) => void;
  saveItem: (item: Item) => string;
  removeItem: (id: string) => void;
  saveTaxCategory: (cat: TaxCategory) => void;
  removeTaxCategory: (id: string) => void;
  saveExpenseCategory: (cat: ExpenseCategory) => void;
  removeExpenseCategory: (id: string) => void;
  saveItemCategory: (cat: ItemCategory) => void;
  removeItemCategory: (id: string) => void;
  saveBrand: (brand: Brand) => void;
  removeBrand: (id: string) => void;
  saveCustomField: (field: CustomField) => void;
  removeCustomField: (id: string) => void;
  saveVehicle: (vehicle: Vehicle) => void;
  removeVehicle: (id: string) => void;
  saveVoucherTemplate: (template: VoucherTemplate) => void;
  removeVoucherTemplate: (id: string) => void;
  savePaymentAccount: (acc: PaymentAccount) => void;
  removePaymentAccount: (id: string) => void;
  saveExchangeRate: (rate: ExchangeRate) => void;
  removeExchangeRate: (id: string) => void;
  saveNumberingSeries: (series: NumberingSeries) => void;

  /* documents */
  nextNumberFor: (kind: NumberingSeries['kind']) => string;
  createDocument: (draft: NewDocumentInput) => string;
  updateDocument: (id: string, patch: Partial<BusinessDocument>) => void;
  recalculateDocument: (id: string) => void;
  /** `overrideCreditLimit` rides along to the server once the user has accepted the credit-limit warning. */
  setDocumentStatus: (id: string, status: DocStatus, opts?: { overrideCreditLimit?: boolean }) => void;
  finalizeDocument: (id: string) => void;
  removeDocument: (id: string) => void;
  duplicateDocument: (id: string) => string;
  convertDocument: (id: string, target: DocumentKind) => string;

  /* payments */
  /** Returns the id, or '' when the account does not fit the payment method. */
  savePayment: (payment: Payment) => string;
  removePayment: (id: string) => void;
  /** Adjust a party's advances against its open invoices/bills. Returns the amount applied, per currency. */
  /** Adjust held advances against open documents; `documentIds` limits which ones. */
  applyAdvances: (partyId: string, direction: PaymentDirection, documentIds?: string[]) => Money[];

  /* expenses */
  /** Returns the id, or '' when the account does not fit the payment method. */
  saveExpense: (expense: Expense) => string;
  removeExpense: (id: string) => void;

  /* books */
  saveLedgerAccount: (account: LedgerAccount) => void;
  removeLedgerAccount: (id: string) => void;
  /** Numbers a new voucher from its kind's series; returns its id. */
  saveVoucher: (voucher: Voucher) => string;
  removeVoucher: (id: string) => void;
  saveCostCentre: (centre: CostCentre) => void;
  removeCostCentre: (id: string) => void;

  /* inventory */
  addStockMovement: (m: Omit<StockMovement, 'id' | 'createdAt' | 'createdBy'>) => void;
  transferStock: (args: { itemId: string; fromBranchId: string; toBranchId: string; quantity: number; date: string; notes?: string }) => void;

  /* supporting: attachments upload through remote/attachments */
  pushNotification: (n: Omit<AppNotification, 'id' | 'createdAt' | 'read'>) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;
  toggleIntegration: (id: string) => void;

  /* compliance */
  saveComplianceSettings: (settings: ComplianceSettings) => void;
  saveTransporter: (transporter: Transporter) => void;
  removeTransporter: (id: string) => void;
  /* persistence */
  hydrated: boolean;
  setHydrated: (v: boolean) => void;
};

export type NewDocumentInput = {
  kind: DocumentKind;
  partyId: string;
  date: string;
  dueDate?: string;
  validUntil?: string;
  currency: string;
  exchangeRate: number;
  lines: DocumentLine[];
  documentDiscountMode?: 'percent' | 'amount';
  documentDiscountValue?: number;
  charges?: Money;
  applyRoundOff?: boolean;
  roundOffManual?: Money;
  notes?: string;
  terms?: string;
  reference?: string;
  supplierDocNumber?: string;
  billOfEntry?: BusinessDocument['billOfEntry'];
  isdInvoice?: boolean;
  placeOfSupplyStateCode?: string;
  reverseCharge?: boolean;
  noteReason?: BusinessDocument['noteReason'];
  tdsSection?: string;
  branchId?: string;
  attachmentIds?: string[];
  sourceDocumentId?: string;
  status?: DocStatus;
};

export type AppState = AppData & {
  session: Session;
  activeCompanyId: string;
  activeBranchId: string | null;
} & Actions;

export type ComplianceResult = { ok: boolean; issues: ComplianceIssue[] };

export type NewEwayBillInput = {
  documentId: string;
  subSupplyType: EwaySubSupplyType;
  subSupplyDescription?: string;
  transactionType: 1 | 2 | 3 | 4;
  from: EwayPlace;
  to: EwayPlace;
  transporterId?: string;
  transporterName?: string;
  transportMode: TransportMode;
  vehicleNumber?: string;
  vehicleType: VehicleType;
  transportDocNumber?: string;
  transportDocDate?: string;
  distanceKm: number;
};

export type ExtendEwayBillInput = {
  remainingDistanceKm: number;
  reasonCode: EwayExtendReasonCode;
  remark?: string;
  transitType: 'inTransit' | 'inMovement';
  currentPlace: string;
  currentPincode: string;
  currentStateCode: string;
};

const emptySession: Session = { userId: null, authenticated: false, onboardingComplete: false };

/**
 * Data saved by an older build. The store only ever holds what the API sent,
 * so anything that predates a shape change is simply loaded again from the
 * server: versions before 3 (when the bundled demo dataset still lived here)
 * start empty and signed out.
 *
 * Version 4 turned `Company.businessType` from an English display label into
 * a stable slug, so it survives a language switch. The eight labels that
 * shipped are mapped back; anything else is left as it is.
 *
 * Version 5 gives every company a starter set of expense categories. Companies
 * created in the app used to get none, which left the expense form with a
 * required category it could not fill.
 */
export function migratePersisted(persisted: unknown, version: number): AppState {
  if (version < 3) {
    return { ...emptyData(), session: emptySession, activeCompanyId: '', activeBranchId: '' } as AppState;
  }
  let state = persisted as AppState;
  if (version < 4) {
    // Business type used to persist its English label, so it stopped matching
    // the picker the moment the app spoke another language. It is a slug now;
    // map the eight labels that shipped, and leave anything unrecognised
    // alone rather than guessing.
    state = {
      ...state,
      companies: (state.companies ?? []).map((c) => ({
        ...c,
        businessType: LEGACY_BUSINESS_TYPE_LABELS[c.businessType] ?? c.businessType,
      })),
    };
  }
  if (version < 5) {
    const withCategories = new Set((state.expenseCategories ?? []).map((c) => c.companyId));
    state = {
      ...state,
      expenseCategories: [
        ...(state.expenseCategories ?? []),
        ...(state.companies ?? [])
          .filter((c) => !withCategories.has(c.id))
          .flatMap((c) => starterExpenseCategories(c.id)),
      ],
    };
  }
  return state;
}

/** Default expense categories for a new company, with ids unique to it. */
function starterExpenseCategories(companyId: string): ExpenseCategory[] {
  return defaultExpenseCategories(companyId).map((c) => ({ ...c, id: uid('exc') }));
}

/** Where the store persisted before it moved to per-collection storage; read once to move it over. */
const PERSIST_KEY = 'ebs.remote.v1';

/** Tells this browser's other tabs which collections changed (IndexedDB writes raise no `storage` event). */
let channel: BroadcastChannel | null | undefined;
export function bookChannel(): BroadcastChannel | null {
  if (channel === undefined) channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('ebs.book');
  return channel;
}

/**
 * Builds before the app went API-only kept a bundled demo dataset under its
 * own key. It belongs to no account, so it is dropped, once, on first launch.
 */
const LEGACY_DEMO_KEY = 'ebs.data.v1';
void AsyncStorage.removeItem(LEGACY_DEMO_KEY).catch(() => {});

let readAttempts = 0;

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      /* -------------------------------------------------------------- */
      /* internal helpers                                               */
      /* -------------------------------------------------------------- */

      const audit = (
        action: string,
        entityType: string,
        entityId: string,
        entityLabel: string,
        extra?: { before?: string; after?: string },
      ) => {
        const s = get();
        const actor = s.users.find((u) => u.id === s.session.userId) ?? s.users[0];
        const event: AuditEvent = {
          id: uid('aud'),
          companyId: s.activeCompanyId,
          actorId: actor?.id ?? '',
          actorName: actor?.name ?? 'You',
          action,
          entityType,
          entityId,
          entityLabel,
          before: extra?.before,
          after: extra?.after,
          device: 'This device',
          createdAt: nowISO(),
        };
        set({ auditEvents: [event, ...get().auditEvents].slice(0, 500) });
      };

      const notify = (kind: NotificationKind, title: string, body: string, entityType?: string, entityId?: string) => {
        const n: AppNotification = {
          id: uid('ntf'),
          companyId: get().activeCompanyId,
          kind,
          title,
          body,
          entityType,
          entityId,
          read: false,
          createdAt: nowISO(),
        };
        set({ notifications: [n, ...get().notifications].slice(0, 200) });
      };

      const companyOf = (companyId: string) => get().companies.find((c) => c.id === companyId);

      const computeTotals = (doc: BusinessDocument) => {
        const s = get();
        const company = companyOf(doc.companyId);
        return calculateDocument({
          lines: doc.lines,
          currency: doc.currency,
          baseCurrency: company?.baseCurrency ?? 'INR',
          exchangeRate: doc.exchangeRate,
          documentDiscountMode: doc.documentDiscountMode,
          documentDiscountValue: doc.documentDiscountValue,
          charges: doc.charges,
          applyRoundOff: doc.applyRoundOff,
          roundOffManual: doc.roundOffManual,
          taxCategories: s.taxCategories.filter((t) => t.companyId === doc.companyId),
          taxContext: buildTaxContext(company, {
            placeOfSupply: doc.placeOfSupplyStateCode,
            party: s.parties.find((p) => p.id === doc.partyId),
            date: doc.date,
            purchase: PURCHASE_KINDS.includes(doc.kind),
            branch: s.branches.find((b) => b.id === doc.branchId),
            reverseCharge: doc.reverseCharge,
          }),
        });
      };

      const computeTds = (doc: BusinessDocument) =>
        tdsForDocument(doc, { company: companyOf(doc.companyId), parties: get().parties, documents: get().documents });

      /**
       * Re-derive paid / partly paid / unpaid for documents whose allocations
       * changed. Any positive allocation short of the total is a valid
       * partial settlement.
       */
      /** A receipt's advance and refund list after a refund out of it changed by `delta` (more paid back is positive). */
      const moveRefund = (receiptId: string, refund: Payment, delta: number) => {
        set({
          payments: get().payments.map((p) => {
            if (p.id !== receiptId) return p;
            const others = (p.refunds ?? []).filter((r) => r.paymentId !== refund.id);
            const kept = get().payments.some((x) => x.id === refund.id);
            return {
              ...p,
              unallocated: { ...p.unallocated, minor: p.unallocated.minor - delta },
              refunds: kept ? [...others, { paymentId: refund.id, number: refund.number, date: refund.date, amount: refund.amount }] : others,
            };
          }),
        });
      };

      const refreshPaymentStatuses = (affected: Set<string>) => {
        if (!affected.size) return;
        const allocations = get().payments.flatMap((p) => p.allocations);
        const documents = get().documents;
        set({
          documents: documents.map((d) => {
            if (!affected.has(d.id) || !isFinalized(d.status) || d.status === 'cancelled' || d.status === 'rejected') return d;
            // Returns and credit notes against it settle it too, as on the server.
            const allocated = allocations
              .filter((a) => a.documentId === d.id)
              .reduce((acc, a) => acc + settledBy(a), 0) + creditedTo(d.id, documents);
            const outstanding = d.totals.grandTotal.minor - allocated;
            const status: DocStatus =
              outstanding <= 0
                ? 'paid'
                : allocated > 0
                  ? 'partiallyPaid'
                  : statusForOutstanding(d, d.totals.grandTotal);
            return status === d.status ? d : { ...d, status, updatedAt: nowISO() };
          }),
        });
      };

      /** Where an entry lands when none was chosen: the branch picked in the switcher, else the company's primary one. */
      const defaultBranchId = (): string => {
        const s = get();
        const own = s.branches.filter((b) => b.companyId === s.activeCompanyId);
        return own.find((b) => b.id === s.activeBranchId)?.id ?? own.find((b) => b.isPrimary)?.id ?? own[0]?.id ?? '';
      };

      const consumeSeriesNumber = (kind: NumberingSeries['kind'], date: string): string => {
        const s = get();
        const companyId = s.activeCompanyId;
        const series = s.numberingSeries.find((x) => x.companyId === companyId && x.kind === kind);
        if (!series) return `${kind.toUpperCase()}-${Date.now()}`;
        const branch = s.branches.find((b) => b.id === (s.activeBranchId ?? ''));
        const number = formatNumber(series, { date, branchCode: branch?.code });
        set({
          numberingSeries: s.numberingSeries.map((x) =>
            x.id === series.id ? { ...x, nextNumber: x.nextNumber + 1 } : x,
          ),
        });
        return number;
      };

      /** Post stock movements for a document that has just been finalized. */
      const postStockFor = (doc: BusinessDocument) => {
        const s = get();
        const type =
          doc.kind === 'invoice' || doc.kind === 'delivery'
            ? 'salesIssue'
            : doc.kind === 'goodsReceipt' || doc.kind === 'purchaseBill'
              ? 'purchaseReceipt'
              : doc.kind === 'salesReturn'
                ? 'salesReturn'
                : doc.kind === 'purchaseReturn'
                  ? 'purchaseReturn'
                  : null;
        if (!type) return;

        const already = s.stockMovements.some((m) => m.referenceId === doc.id);
        if (already) return;

        const moves: StockMovement[] = [];
        doc.lines.forEach((line) => {
          const item = s.items.find((i) => i.id === line.itemId);
          if (!item || !item.trackInventory) return;
          moves.push({
            id: uid('stk'),
            companyId: doc.companyId,
            branchId: doc.branchId,
            itemId: item.id,
            type,
            quantity: line.quantity,
            unitCost: type === 'purchaseReceipt' ? line.unitPrice : item.purchasePrice,
            date: doc.date,
            referenceId: doc.id,
            referenceNumber: doc.number,
            createdBy: s.session.userId ?? '',
            createdAt: nowISO(),
          });
        });
        if (moves.length) set({ stockMovements: [...get().stockMovements, ...moves] });
      };

      return {
        ...emptyData(),
        session: emptySession,
        activeCompanyId: '',
        activeBranchId: '',
        hydrated: false,
        setHydrated: (hydrated) => set({ hydrated }),

        /* ------------------------------------------------------------ */
        /* session                                                      */
        /* ------------------------------------------------------------ */
        signOut: () => set({ session: emptySession }),
        completeOnboarding: () =>
          set({ session: { ...get().session, onboardingComplete: true } }),
        revokeDevice: (id) => set({ devices: get().devices.filter((d) => d.id !== id) }),

        /* ------------------------------------------------------------ */
        /* company                                                      */
        /* ------------------------------------------------------------ */
        setActiveCompany: (companyId) => {
          const branch = get().branches.find((b) => b.companyId === companyId && b.isPrimary)
            ?? get().branches.find((b) => b.companyId === companyId);
          set({ activeCompanyId: companyId, activeBranchId: branch?.id ?? null });
        },
        setActiveBranch: (branchId) => set({ activeBranchId: branchId }),
        saveCompany: (incoming) => {
          const s = get();
          const prev = s.companies.find((c) => c.id === incoming.id);
          const posted = s.documents.some((d) => d.companyId === incoming.id && isFinalized(d.status));
          const company = prev ? applyProfileLocks(prev, incoming, posted) : incoming;
          set({
            companies: s.companies.map((c) => (c.id === company.id ? company : c)),
            // The head office is the registered address: keep its branch record in step.
            branches: s.branches.map((b) =>
              b.companyId === company.id && b.isPrimary
                ? {
                    ...b,
                    address: { ...company.address },
                    gstin: company.taxRegistration?.registered ? company.taxRegistration.identifier : b.gstin,
                    phone: company.phone ?? b.phone,
                  }
                : b,
            ),
          });
          audit('updated', 'company', company.id, company.name);
        },
        setPlan: (companyId, plan) => {
          const company = get().companies.find((c) => c.id === companyId);
          if (!company || company.plan === plan) return;
          set({ companies: get().companies.map((c) => (c.id === companyId ? { ...c, plan } : c)) });
          audit('updated', 'company', companyId, `Plan changed to ${plan}`);
        },
        createCompany: (partial) => {
          const id = uid('cmp');
          const company: Company = { ...partial, id, accountId: get().accountId, createdAt: nowISO() };
          const branch: Branch = {
            id: uid('brn'),
            companyId: id,
            name: 'Head office',
            code: 'HO',
            address: partial.address,
            gstin: partial.taxRegistration?.registered ? partial.taxRegistration.identifier : undefined,
            isPrimary: true,
          };
          const kinds = SERIES_KINDS;
          const prefixes = DEFAULT_PREFIXES;
          const series: NumberingSeries[] = kinds.map((kind) => ({
            id: uid('series'),
            companyId: id,
            kind,
            prefix: prefixes[kind],
            nextNumber: 1,
            padding: 4,
            includeFiscalYear: true,
            includeBranchCode: false,
            resetPolicy: 'yearly',
          }));
          const taxes: TaxCategory[] = [0, 5, 12, 18, 28].map((rate) => ({
            id: uid('tax'),
            companyId: id,
            name: rate === 0 ? 'GST 0% (Exempt)' : `GST ${rate}%`,
            rate,
            type: 'GST',
            effectiveFrom: today(),
          }));
          const account: PaymentAccount = {
            id: uid('acc'),
            companyId: id,
            name: 'Cash in hand',
            type: 'cash',
            currency: partial.baseCurrency,
            openingBalance: zero(partial.baseCurrency),
            isDefault: true,
          };
          set({
            companies: [...get().companies, company],
            branches: [...get().branches, branch],
            numberingSeries: [...get().numberingSeries, ...series],
            taxCategories: [...get().taxCategories, ...taxes],
            paymentAccounts: [...get().paymentAccounts, account],
            expenseCategories: [...get().expenseCategories, ...starterExpenseCategories(id)],
            activeCompanyId: id,
            activeBranchId: branch.id,
          });
          return id;
        },
        saveBranch: (branch) => {
          const exists = get().branches.some((b) => b.id === branch.id);
          // One primary branch per company: marking this one demotes the others.
          const others = branch.isPrimary
            ? get().branches.map((b) =>
                b.companyId === branch.companyId && b.id !== branch.id && b.isPrimary ? { ...b, isPrimary: false } : b,
              )
            : get().branches;
          set({
            branches: exists
              ? others.map((b) => (b.id === branch.id ? branch : b))
              : [...others, branch],
          });
          audit(exists ? 'updated' : 'created', 'branch', branch.id, branch.name);
        },
        removeBranch: (id) => {
          const b = get().branches.find((x) => x.id === id);
          set({ branches: get().branches.filter((x) => x.id !== id) });
          if (b) audit('deleted', 'branch', id, b.name);
        },
        saveUser: (user) => {
          const exists = get().users.some((u) => u.id === user.id);
          set({ users: exists ? get().users.map((u) => (u.id === user.id ? user : u)) : [...get().users, user] });
          audit(exists ? 'updated' : 'invited', 'user', user.id, user.name);
        },
        removeUser: (id) => set({ users: get().users.filter((u) => u.id !== id) }),

        /* ------------------------------------------------------------ */
        /* masters                                                      */
        /* ------------------------------------------------------------ */
        saveParty: (party) => {
          const previous = get().parties.find((p) => p.id === party.id);
          const exists = !!previous;
          set({
            parties: exists ? get().parties.map((p) => (p.id === party.id ? party : p)) : [...get().parties, party],
          });
          audit(exists ? 'updated' : 'created', party.kind, party.id, party.name, previous ? { before: JSON.stringify(previous), after: JSON.stringify(party) } : undefined);
          return party.id;
        },
        removeParty: (id) => {
          const p = get().parties.find((x) => x.id === id);
          set({ parties: get().parties.filter((x) => x.id !== id) });
          if (p) audit('deleted', p.kind, id, p.name);
        },
        saveItem: (item) => {
          const previous = get().items.find((i) => i.id === item.id);
          const exists = !!previous;
          set({ items: exists ? get().items.map((i) => (i.id === item.id ? item : i)) : [...get().items, item] });
          if (!exists && item.trackInventory && item.openingStock > 0) {
            const m: StockMovement = {
              id: uid('stk'),
              companyId: item.companyId,
              branchId: defaultBranchId(),
              itemId: item.id,
              type: 'opening',
              quantity: item.openingStock,
              unitCost: item.purchasePrice,
              date: item.openingStockDate ?? today(),
              notes: 'Opening stock',
              createdBy: get().session.userId ?? '',
              createdAt: nowISO(),
            };
            set({ stockMovements: [...get().stockMovements, m] });
          }
          audit(exists ? 'updated' : 'created', 'item', item.id, item.name, previous ? { before: JSON.stringify(previous), after: JSON.stringify(item) } : undefined);
          return item.id;
        },
        removeItem: (id) => {
          const i = get().items.find((x) => x.id === id);
          set({ items: get().items.filter((x) => x.id !== id) });
          if (i) audit('deleted', 'item', id, i.name);
        },
        saveTaxCategory: (cat) => {
          const exists = get().taxCategories.some((c) => c.id === cat.id);
          set({
            taxCategories: exists
              ? get().taxCategories.map((c) => (c.id === cat.id ? cat : c))
              : [...get().taxCategories, cat],
          });
          audit(exists ? 'updated' : 'created', 'taxCategory', cat.id, cat.name);
        },
        removeTaxCategory: (id) => set({ taxCategories: get().taxCategories.filter((c) => c.id !== id) }),
        saveExpenseCategory: (cat) => {
          const exists = get().expenseCategories.some((c) => c.id === cat.id);
          set({
            expenseCategories: exists
              ? get().expenseCategories.map((c) => (c.id === cat.id ? cat : c))
              : [...get().expenseCategories, cat],
          });
        },
        removeExpenseCategory: (id) => set({ expenseCategories: get().expenseCategories.filter((c) => c.id !== id) }),
        // A book saved before these existed has no list yet.
        saveItemCategory: (cat) => {
          const list = get().itemCategories ?? [];
          const exists = list.some((c) => c.id === cat.id);
          set({ itemCategories: exists ? list.map((c) => (c.id === cat.id ? cat : c)) : [...list, cat] });
        },
        removeItemCategory: (id) => set({ itemCategories: (get().itemCategories ?? []).filter((c) => c.id !== id) }),
        saveBrand: (brand) => {
          const list = get().brands ?? [];
          const exists = list.some((b) => b.id === brand.id);
          set({ brands: exists ? list.map((b) => (b.id === brand.id ? brand : b)) : [...list, brand] });
        },
        removeBrand: (id) => set({ brands: (get().brands ?? []).filter((b) => b.id !== id) }),
        saveCustomField: (field) => {
          const list = get().customFields ?? [];
          const exists = list.some((f) => f.id === field.id);
          set({ customFields: exists ? list.map((f) => (f.id === field.id ? field : f)) : [...list, field] });
        },
        removeCustomField: (id) => set({ customFields: (get().customFields ?? []).filter((f) => f.id !== id) }),
        saveVehicle: (vehicle) => {
          const list = get().vehicles ?? [];
          const exists = list.some((v) => v.id === vehicle.id);
          set({ vehicles: exists ? list.map((v) => (v.id === vehicle.id ? vehicle : v)) : [...list, vehicle] });
        },
        removeVehicle: (id) => set({ vehicles: (get().vehicles ?? []).filter((v) => v.id !== id) }),
        saveVoucherTemplate: (template) => {
          const list = get().voucherTemplates ?? [];
          const exists = list.some((x) => x.id === template.id);
          set({ voucherTemplates: exists ? list.map((x) => (x.id === template.id ? template : x)) : [...list, template] });
        },
        removeVoucherTemplate: (id) => set({ voucherTemplates: (get().voucherTemplates ?? []).filter((x) => x.id !== id) }),
        savePaymentAccount: (acc) => {
          const exists = get().paymentAccounts.some((a) => a.id === acc.id);
          const next = exists
            ? get().paymentAccounts.map((a) => (a.id === acc.id ? acc : a))
            : [...get().paymentAccounts, acc];
          set({
            paymentAccounts: acc.isDefault
              ? next.map((a) => (a.companyId === acc.companyId ? { ...a, isDefault: a.id === acc.id } : a))
              : next,
          });
        },
        removePaymentAccount: (id) => set({ paymentAccounts: get().paymentAccounts.filter((a) => a.id !== id) }),
        saveExchangeRate: (rate) => {
          const exists = get().exchangeRates.some((r) => r.id === rate.id);
          set({
            exchangeRates: exists
              ? get().exchangeRates.map((r) => (r.id === rate.id ? rate : r))
              : [...get().exchangeRates, rate],
          });
          audit(exists ? 'updated' : 'created', 'exchangeRate', rate.id, `${rate.from}/${rate.to}`);
        },
        removeExchangeRate: (id) => set({ exchangeRates: get().exchangeRates.filter((r) => r.id !== id) }),
        saveNumberingSeries: (series) => {
          set({ numberingSeries: get().numberingSeries.map((s) => (s.id === series.id ? series : s)) });
          audit('updated', 'numberingSeries', series.id, series.prefix);
        },

        /* ------------------------------------------------------------ */
        /* documents                                                    */
        /* ------------------------------------------------------------ */
        nextNumberFor: (kind) => {
          const s = get();
          const series = s.numberingSeries.find((x) => x.companyId === s.activeCompanyId && x.kind === kind);
          if (!series) return '—';
          const branch = s.branches.find((b) => b.id === (s.activeBranchId ?? ''));
          return formatNumber(series, { date: today(), branchCode: branch?.code });
        },

        createDocument: (draft) => {
          const s = get();
          const status = draft.status ?? initialStatus(draft.kind);
          const finalized = isFinalized(status);
          // Opening invoices and bills are only ever imported by the server, never made here.
          const number = finalized ? consumeSeriesNumber(draft.kind as SeriesDocumentKind, draft.date) : `${draft.kind.toUpperCase()}-DRAFT`;
          const party = s.parties.find((p) => p.id === draft.partyId);

          const doc: BusinessDocument = {
            id: uid(draft.kind),
            companyId: s.activeCompanyId,
            branchId: draft.branchId ?? defaultBranchId(),
            kind: draft.kind,
            number,
            status,
            partyId: draft.partyId,
            date: draft.date,
            dueDate: draft.dueDate,
            validUntil: draft.validUntil,
            reference: draft.reference,
            supplierDocNumber: draft.supplierDocNumber,
            billOfEntry: draft.billOfEntry,
            isdInvoice: draft.isdInvoice,
            currency: draft.currency,
            exchangeRate: draft.exchangeRate,
            lines: draft.lines,
            documentDiscountMode: draft.documentDiscountMode ?? 'percent',
            documentDiscountValue: draft.documentDiscountValue ?? 0,
            charges: draft.charges ?? zero(draft.currency),
            applyRoundOff: draft.applyRoundOff ?? draft.currency === 'INR',
            roundOffManual: draft.roundOffManual,
            placeOfSupplyStateCode: draft.placeOfSupplyStateCode ?? party?.billingAddress?.stateCode,
            reverseCharge: draft.reverseCharge,
            noteReason: draft.noteReason,
            tdsSection: draft.tdsSection,
            notes: draft.notes,
            terms: draft.terms,
            attachmentIds: draft.attachmentIds ?? [],
            sourceDocumentId: draft.sourceDocumentId,
            totals: {
              subtotal: zero(draft.currency),
              lineDiscount: zero(draft.currency),
              documentDiscount: zero(draft.currency),
              taxableAmount: zero(draft.currency),
              taxLines: [],
              totalTax: zero(draft.currency),
              charges: zero(draft.currency),
              roundOff: zero(draft.currency),
              grandTotal: zero(draft.currency),
              grandTotalBase: zero(draft.currency),
            },
            createdBy: s.session.userId ?? '',
            createdAt: nowISO(),
            updatedAt: nowISO(),
          };
          doc.totals = computeTotals(doc);
          doc.tds = computeTds(doc);

          set({ documents: [doc, ...get().documents] });
          if (finalized) postStockFor(doc);
          if (finalized && doc.sourceDocumentId && CREDIT_KINDS.includes(doc.kind)) {
            refreshPaymentStatuses(new Set([doc.sourceDocumentId]));
          }
          audit(finalized ? 'finalized' : 'created', draft.kind, doc.id, doc.number);
          return doc.id;
        },

        updateDocument: (id, patch) => {
          const existing = get().documents.find((d) => d.id === id);
          if (!existing) return;
          const merged = { ...existing, ...patch, updatedAt: nowISO() };
          merged.totals = computeTotals(merged);
          merged.tds = computeTds(merged);
          set({ documents: get().documents.map((d) => (d.id === id ? merged : d)) });
          const partyName = (pid: string) => get().parties.find((p) => p.id === pid)?.name;
          audit('updated', existing.kind, id, merged.number, {
            before: documentAuditSnapshot(existing, partyName(existing.partyId)),
            after: documentAuditSnapshot(merged, partyName(merged.partyId)),
          });
        },

        recalculateDocument: (id) => {
          const existing = get().documents.find((d) => d.id === id);
          if (!existing) return;
          const merged = { ...existing, totals: computeTotals(existing) };
          set({ documents: get().documents.map((d) => (d.id === id ? merged : d)) });
        },

        setDocumentStatus: (id, status) => {
          const existing = get().documents.find((d) => d.id === id);
          if (!existing) return;
          let number = existing.number;
          // A draft withdrawn never takes a number from the series.
          if (!isFinalized(existing.status) && isFinalized(status) && status !== 'cancelled') {
            number = consumeSeriesNumber(existing.kind as SeriesDocumentKind, existing.date);
          }
          const updated = { ...existing, status, number, updatedAt: nowISO() };
          set({ documents: get().documents.map((d) => (d.id === id ? updated : d)) });
          if (isFinalized(status)) postStockFor(updated);
          audit(`marked ${status}`, existing.kind, id, number);
          // A return or credit note going live (or void) changes what its source owes.
          if (existing.sourceDocumentId && CREDIT_KINDS.includes(existing.kind)) {
            refreshPaymentStatuses(new Set([existing.sourceDocumentId]));
          }

          if (existing.kind === 'invoice' && status === 'sent') {
            notify('invoiceSent', 'Invoice sent', `${number} was shared with the customer.`, 'invoice', id);
          }
        },

        finalizeDocument: (id) => {
          const existing = get().documents.find((d) => d.id === id);
          if (!existing) return;
          const target: DocStatus =
            existing.kind === 'salesReturn' || existing.kind === 'purchaseReturn'
              ? 'approved'
              : existing.kind === 'quote' || existing.kind === 'proforma'
                ? 'sent'
                : existing.kind === 'salesOrder' || existing.kind === 'purchaseOrder'
                  ? 'confirmed'
                  : existing.kind === 'delivery'
                    ? 'delivered'
                    : existing.kind === 'goodsReceipt'
                      ? 'received'
                      : 'issued';
          // The server reports to the GST portals on finalise where the company asked for that.
          get().setDocumentStatus(id, target);
        },

        removeDocument: (id) => {
          const d = get().documents.find((x) => x.id === id);
          set({
            documents: get().documents.filter((x) => x.id !== id),
            stockMovements: get().stockMovements.filter((m) => m.referenceId !== id),
          });
          if (d) audit('deleted', d.kind, id, d.number);
        },

        duplicateDocument: (id) => {
          const src = get().documents.find((d) => d.id === id);
          if (!src) return '';
          return get().createDocument({
            kind: src.kind,
            partyId: src.partyId,
            date: today(),
            dueDate: src.dueDate,
            currency: src.currency,
            exchangeRate: src.exchangeRate,
            lines: src.lines.map((l) => ({ ...l, id: uid('ln') })),
            documentDiscountMode: src.documentDiscountMode,
            documentDiscountValue: src.documentDiscountValue,
            charges: src.charges,
            applyRoundOff: src.applyRoundOff,
            roundOffManual: src.roundOffManual,
            notes: src.notes,
            terms: src.terms,
            placeOfSupplyStateCode: src.placeOfSupplyStateCode,
            reverseCharge: src.reverseCharge,
            branchId: src.branchId,
            status: initialStatus(src.kind),
          });
        },

        convertDocument: (id, target) => {
          const src = get().documents.find((d) => d.id === id);
          // Nothing is made from a cancelled or draft document, nor twice from one order.
          if (!src || conversionBlock(src, target, get().documents)) return '';
          const party = get().parties.find((p) => p.id === src.partyId);
          const newId = get().createDocument({
            kind: target,
            partyId: src.partyId,
            date: today(),
            dueDate:
              isPayableDocument(target)
                ? new Date(Date.now() + (party?.paymentTermsDays ?? 30) * 86400000).toISOString().slice(0, 10)
                : undefined,
            currency: src.currency,
            exchangeRate: src.exchangeRate,
            lines: src.lines.map((l) => ({ ...l, id: uid('ln') })),
            documentDiscountMode: src.documentDiscountMode,
            documentDiscountValue: src.documentDiscountValue,
            charges: src.charges,
            applyRoundOff: src.applyRoundOff,
            roundOffManual: src.roundOffManual,
            // The PO number and supplier's bill number travel with the conversion, as on the server.
            reference: src.reference,
            supplierDocNumber: src.supplierDocNumber,
            notes: src.notes,
            terms: src.terms,
            placeOfSupplyStateCode: src.placeOfSupplyStateCode,
            reverseCharge: src.reverseCharge,
            branchId: src.branchId,
            sourceDocumentId: src.id,
            // A return starts as requested, not draft, or it has no way forward to post.
            status: initialStatus(target),
          });
          audit(`converted to ${target}`, src.kind, src.id, src.number);
          return newId;
        },

        /* ------------------------------------------------------------ */
        /* payments                                                     */
        /* ------------------------------------------------------------ */
        savePayment: (payment) => {
          // A bank, cheque or card payment cannot go through cash in hand (and so on).
          if (!accountFitsMethod(payment.method, get().paymentAccounts.find((a) => a.id === payment.accountId))) return '';
          const previous = get().payments.find((p) => p.id === payment.id);
          const exists = !!previous;
          const withNumber =
            payment.number && payment.number !== ''
              ? payment
              : { ...payment, number: consumeSeriesNumber('payment', payment.date) };

          set({
            payments: exists
              ? get().payments.map((p) => (p.id === payment.id ? withNumber : p))
              : [withNumber, ...get().payments],
          });
          // A refund comes out of the advance on the receipt it pays back, as the server will have it.
          if (withNumber.refundOf) moveRefund(withNumber.refundOf, withNumber, withNumber.amount.minor - (previous?.amount.minor ?? 0));

          // Refresh the status of every invoice/bill this payment touches —
          // including ones an edit removed it from.
          refreshPaymentStatuses(
            new Set([...withNumber.allocations, ...(previous?.allocations ?? [])].map((a) => a.documentId)),
          );

          audit(exists ? 'updated payment' : 'recorded payment', 'payment', withNumber.id, withNumber.number);
          if (!exists && withNumber.direction === 'received') {
            notify('paymentReceived', 'Payment recorded', `${withNumber.number} recorded successfully.`, 'payment', withNumber.id);
          }
          return withNumber.id;
        },

        removePayment: (id) => {
          const p = get().payments.find((x) => x.id === id);
          if (!p) return;
          set({ payments: get().payments.filter((x) => x.id !== id) });
          if (p.refundOf) moveRefund(p.refundOf, p, -p.amount.minor);
          refreshPaymentStatuses(new Set(p.allocations.map((a) => a.documentId)));
          audit('deleted payment', 'payment', id, p.number);
        },

        applyAdvances: (partyId, direction, documentIds) => {
          const s = get();
          const kind = direction === 'received' ? 'invoice' : 'purchaseBill';
          const docs = s.documents.filter(
            (d) =>
              d.companyId === s.activeCompanyId &&
              d.kind === kind &&
              d.partyId === partyId &&
              (!documentIds || documentIds.includes(d.id)),
          );
          const partyPayments = s.payments.filter(
            (p) => p.companyId === s.activeCompanyId && p.partyId === partyId && p.direction === direction,
          );
          const changed = allocateAdvances(docs, partyPayments);
          if (!changed.length) return [];

          const byId = new Map(changed.map((p) => [p.id, p]));
          const before = new Map(partyPayments.map((p) => [p.id, p.unallocated.minor]));
          set({ payments: s.payments.map((p) => byId.get(p.id) ?? p) });
          refreshPaymentStatuses(new Set(changed.flatMap((p) => p.allocations.map((a) => a.documentId))));

          const applied = new Map<string, number>();
          changed.forEach((p) => {
            applied.set(p.currency, (applied.get(p.currency) ?? 0) + (before.get(p.id) ?? 0) - p.unallocated.minor);
            audit('adjusted advance', 'payment', p.id, p.number);
          });
          return [...applied].map(([currency, minor]) => ({ minor, currency }));
        },

        /* ------------------------------------------------------------ */
        /* expenses                                                     */
        /* ------------------------------------------------------------ */
        saveExpense: (expense) => {
          if (!accountFitsMethod(expense.method, get().paymentAccounts.find((a) => a.id === expense.accountId))) return '';
          const exists = get().expenses.some((e) => e.id === expense.id);
          const withNumber =
            expense.number && expense.number !== ''
              ? expense
              : { ...expense, number: consumeSeriesNumber('expense', expense.date) };
          set({
            expenses: exists
              ? get().expenses.map((e) => (e.id === expense.id ? withNumber : e))
              : [withNumber, ...get().expenses],
          });
          audit(exists ? 'updated' : 'created', 'expense', withNumber.id, withNumber.number);
          return withNumber.id;
        },
        removeExpense: (id) => {
          const e = get().expenses.find((x) => x.id === id);
          set({ expenses: get().expenses.filter((x) => x.id !== id) });
          if (e) audit('deleted', 'expense', id, e.number);
        },

        /* ------------------------------------------------------------ */
        /* books                                                        */
        /* ------------------------------------------------------------ */
        saveLedgerAccount: (account) => {
          const exists = get().ledgerAccounts.some((a) => a.id === account.id);
          set({ ledgerAccounts: exists ? get().ledgerAccounts.map((a) => (a.id === account.id ? account : a)) : [...get().ledgerAccounts, account] });
        },
        removeLedgerAccount: (id) => set({ ledgerAccounts: get().ledgerAccounts.filter((a) => a.id !== id) }),
        saveVoucher: (voucher) => {
          const exists = get().vouchers.some((v) => v.id === voucher.id);
          // A draft's number is its id, as on the server; it takes one from the series when posted.
          const draft = voucher.status === 'draft';
          const unnumbered = !voucher.number || voucher.number === voucher.id;
          const numbered = draft ? { ...voucher, number: voucher.number || voucher.id } : unnumbered ? { ...voucher, status: 'posted' as const, number: consumeSeriesNumber(voucher.kind, voucher.date) } : voucher;
          set({ vouchers: exists ? get().vouchers.map((v) => (v.id === voucher.id ? numbered : v)) : [numbered, ...get().vouchers] });
          audit(exists ? 'updated' : 'created', 'voucher', numbered.id, numbered.number);
          return numbered.id;
        },
        removeVoucher: (id) => {
          const v = get().vouchers.find((x) => x.id === id);
          set({ vouchers: get().vouchers.filter((x) => x.id !== id) });
          if (v) audit('deleted', 'voucher', id, v.number);
        },
        saveCostCentre: (centre) => {
          const list = get().costCentres ?? [];
          const exists = list.some((c) => c.id === centre.id);
          set({ costCentres: exists ? list.map((c) => (c.id === centre.id ? centre : c)) : [...list, centre] });
        },
        removeCostCentre: (id) => set({ costCentres: (get().costCentres ?? []).filter((c) => c.id !== id) }),

        /* ------------------------------------------------------------ */
        /* inventory                                                    */
        /* ------------------------------------------------------------ */
        addStockMovement: (m) => {
          const movement: StockMovement = {
            ...m,
            id: uid('stk'),
            createdBy: get().session.userId ?? '',
            createdAt: nowISO(),
          };
          set({ stockMovements: [...get().stockMovements, movement] });
          const item = get().items.find((i) => i.id === m.itemId);
          audit('stock movement', 'inventory', movement.id, item?.name ?? m.itemId);
        },

        transferStock: ({ itemId, fromBranchId, toBranchId, quantity, date, notes }) => {
          const s = get();
          const item = s.items.find((i) => i.id === itemId);
          const base: Omit<StockMovement, 'id' | 'type' | 'branchId'> = {
            companyId: s.activeCompanyId,
            itemId,
            quantity,
            unitCost: item?.purchasePrice ?? zero('INR'),
            date,
            notes,
            createdBy: s.session.userId ?? '',
            createdAt: nowISO(),
          };
          set({
            stockMovements: [
              ...s.stockMovements,
              { ...base, id: uid('stk'), type: 'transferOut', branchId: fromBranchId },
              { ...base, id: uid('stk'), type: 'transferIn', branchId: toBranchId },
            ],
          });
          audit('stock transfer', 'inventory', itemId, item?.name ?? itemId);
        },

        /* ------------------------------------------------------------ */
        /* supporting                                                   */
        /* ------------------------------------------------------------ */
        pushNotification: (n) => notify(n.kind, n.title, n.body, n.entityType, n.entityId),
        markNotificationRead: (id) =>
          set({ notifications: get().notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }),
        markAllNotificationsRead: () =>
          set({ notifications: get().notifications.map((n) => ({ ...n, read: true })) }),
        clearNotifications: () =>
          set({ notifications: get().notifications.filter((n) => n.companyId !== get().activeCompanyId) }),
        toggleIntegration: (id) =>
          set({
            integrations: get().integrations.map((i) => (i.id === id ? { ...i, connected: !i.connected } : i)),
          }),
        /* ------------------------------------------------------------ */
        /* compliance (FRD 16)                                          */
        /* ------------------------------------------------------------ */

        saveComplianceSettings: (settings) => {
          const exists = get().complianceSettings.some((c) => c.companyId === settings.companyId);
          const next = { ...settings, updatedAt: nowISO() };
          set({
            complianceSettings: exists
              ? get().complianceSettings.map((c) => (c.companyId === settings.companyId ? next : c))
              : [next, ...get().complianceSettings],
          });
          audit('updated', 'complianceSettings', settings.companyId, 'E-invoicing & e-way bill');
        },
        saveTransporter: (transporter) => {
          const exists = get().transporters.some((x) => x.id === transporter.id);
          set({
            transporters: exists
              ? get().transporters.map((x) => (x.id === transporter.id ? transporter : x))
              : [...get().transporters, transporter],
          });
          audit(exists ? 'updated' : 'created', 'transporter', transporter.id, transporter.name);
        },
        removeTransporter: (id) => {
          const gone = get().transporters.find((x) => x.id === id);
          set({ transporters: get().transporters.filter((x) => x.id !== id) });
          if (gone) audit('deleted', 'transporter', id, gone.name);
        },

      };
    },
    {
      name: PERSIST_KEY,
      version: 5,
      // One row per collection, encrypted on phones (bookStorage.ts); the old single entry moves over once.
      storage: createBookStorage<AppState>({
        backend: bookBackend,
        legacy: AsyncStorage,
        legacyKey: PERSIST_KEY,
        onError: (err, during) => {
          reportError(err, { source: `book.${during}` });
          // Shown on the Sync screen: the change is still here in memory and in the queue.
          if (during === 'write') useRemoteMeta.getState().patch({ lastError: i18nInstance.t('settings:sync.storageFull') });
        },
        onWritten: (keys) => bookChannel()?.postMessage({ keys }),
      }),
      partialize: (s) => {
        const { hydrated, ...rest } = s;
        void hydrated;
        return rest as AppState;
      },
      migrate: (persisted, version) => migratePersisted(persisted, version),
      onRehydrateStorage: () => (state, error) => {
        // Only the first read: a re-read for another tab's change must not save this tab's copy back.
        if (!error) return state?.hydrated ? undefined : state?.setHydrated(true);
        if (readAttempts++ === 0) return void useAppStore.persist.rehydrate();
        // The book may still be on disk: carry on, but never save over it this run.
        useAppStore.persist.setOptions({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } });
        useAppStore.setState({ hydrated: true });
      },
    },
  ),
);
