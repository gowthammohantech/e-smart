import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  Attachment,
  AuditEvent,
  AppNotification,
  Branch,
  BusinessDocument,
  Company,
  DeviceSession,
  DocStatus,
  DocumentKind,
  DocumentLine,
  ExchangeRate,
  Expense,
  ExpenseCategory,
  Integration,
  Item,
  NotificationKind,
  NumberingSeries,
  Party,
  Payment,
  PaymentAccount,
  StockMovement,
  SyncQueueEntry,
  TaxCategory,
  User,
} from '@/types';
import { Money, zero } from '@/lib/money';
import { nowISO, today } from '@/lib/date';
import { uid } from '@/lib/id';
import { calculateDocument } from '@/domain/lineCalc';
import { formatNumber } from '@/domain/numbering';
import { initialStatus, isFinalized } from '@/domain/documentStates';
import { INTEGRATIONS } from '@/data/masters';
import {
  ACCOUNT_ID,
  CURRENT_USER_ID,
  PRIMARY_COMPANY_ID,
  seedBranches,
  seedCompanies,
  seedDevices,
  seedExchangeRates,
  seedExpenseCategories,
  seedItems,
  seedNumberingSeries,
  seedParties,
  seedPaymentAccounts,
  seedTaxCategories,
  seedUsers,
} from '@/data/seed';
import {
  seedAttachments,
  seedAudit,
  seedDocuments,
  seedExpenses,
  seedNotifications,
  seedPayments,
  seedStockMovements,
  seedSyncQueue,
} from '@/data/seedTransactions';

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
  paymentAccounts: PaymentAccount[];
  exchangeRates: ExchangeRate[];
  numberingSeries: NumberingSeries[];
  documents: BusinessDocument[];
  payments: Payment[];
  expenses: Expense[];
  stockMovements: StockMovement[];
  attachments: Attachment[];
  notifications: AppNotification[];
  auditEvents: AuditEvent[];
  syncQueue: SyncQueueEntry[];
  integrations: Integration[];
};

export type Session = {
  userId: string | null;
  authenticated: boolean;
  onboardingComplete: boolean;
  signedInAt?: string;
};

export function buildSeedData(): AppData {
  const companies = seedCompanies();
  const branches = seedBranches();
  const users = seedUsers();
  const parties = seedParties();
  const items = seedItems();
  const taxCategories = seedTaxCategories();
  const series = seedNumberingSeries();
  const documents = seedDocuments({ items, parties, taxCategories, series });
  const payments = seedPayments(documents, series);
  const expenses = seedExpenses(series);
  const stockMovements = seedStockMovements(items, documents);

  // Advance each series past the numbers the seed data already consumed.
  const advanced = series.map((s) => {
    const used =
      s.kind === 'payment'
        ? payments.filter((p) => p.companyId === s.companyId).length
        : s.kind === 'expense'
          ? expenses.filter((e) => e.companyId === s.companyId).length
          : documents.filter((d) => d.companyId === s.companyId && d.kind === s.kind).length;
    return { ...s, nextNumber: used + 1 };
  });

  return {
    accountId: ACCOUNT_ID,
    users,
    devices: seedDevices(),
    companies,
    branches,
    parties,
    items,
    taxCategories,
    expenseCategories: seedExpenseCategories(),
    paymentAccounts: seedPaymentAccounts(),
    exchangeRates: seedExchangeRates(),
    numberingSeries: advanced,
    documents,
    payments,
    expenses,
    stockMovements,
    attachments: seedAttachments(),
    notifications: seedNotifications(documents, payments),
    auditEvents: seedAudit(documents, payments),
    syncQueue: seedSyncQueue(),
    integrations: INTEGRATIONS.map((i) => ({ ...i })),
  };
}

type Actions = {
  /* session */
  signIn: (email: string) => void;
  signInWithOtp: (phone: string) => void;
  signUp: (name: string, email: string) => void;
  signOut: () => void;
  completeOnboarding: () => void;
  revokeDevice: (id: string) => void;

  /* company */
  setActiveCompany: (companyId: string) => void;
  setActiveBranch: (branchId: string) => void;
  saveCompany: (company: Company) => void;
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
  setDocumentStatus: (id: string, status: DocStatus) => void;
  finalizeDocument: (id: string) => void;
  removeDocument: (id: string) => void;
  duplicateDocument: (id: string) => string;
  convertDocument: (id: string, target: DocumentKind) => string;

  /* payments */
  savePayment: (payment: Payment) => string;
  removePayment: (id: string) => void;

  /* expenses */
  saveExpense: (expense: Expense) => string;
  removeExpense: (id: string) => void;

  /* inventory */
  addStockMovement: (m: Omit<StockMovement, 'id' | 'createdAt' | 'createdBy'>) => void;
  transferStock: (args: { itemId: string; fromBranchId: string; toBranchId: string; quantity: number; date: string; notes?: string }) => void;

  /* supporting */
  addAttachment: (a: Omit<Attachment, 'id' | 'uploadedAt'>) => string;
  removeAttachment: (id: string) => void;
  pushNotification: (n: Omit<AppNotification, 'id' | 'createdAt' | 'read'>) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;
  toggleIntegration: (id: string) => void;
  retrySync: (id: string) => void;
  clearSyncQueue: () => void;

  /* demo control */
  resetDemoData: () => void;
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
  notes?: string;
  terms?: string;
  reference?: string;
  supplierDocNumber?: string;
  placeOfSupplyStateCode?: string;
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

const emptySession: Session = { userId: null, authenticated: false, onboardingComplete: false };

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
          actorId: actor?.id ?? CURRENT_USER_ID,
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

      const taxContextFor = (companyId: string, placeOfSupply?: string) => {
        const company = companyOf(companyId);
        const reg = company?.taxRegistration;
        return {
          regime: reg?.regime ?? ('NONE' as const),
          homeStateCode: reg?.placeOfSupplyStateCode,
          placeOfSupplyStateCode: placeOfSupply ?? reg?.placeOfSupplyStateCode,
          registered: !!reg?.registered,
        };
      };

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
          taxCategories: s.taxCategories.filter((t) => t.companyId === doc.companyId),
          taxContext: taxContextFor(doc.companyId, doc.placeOfSupplyStateCode),
        });
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
            createdBy: s.session.userId ?? CURRENT_USER_ID,
            createdAt: nowISO(),
          });
        });
        if (moves.length) set({ stockMovements: [...get().stockMovements, ...moves] });
      };

      const seed = buildSeedData();

      return {
        ...seed,
        session: emptySession,
        activeCompanyId: PRIMARY_COMPANY_ID,
        activeBranchId: 'brn_mum',
        hydrated: false,
        setHydrated: (hydrated) => set({ hydrated }),

        /* ------------------------------------------------------------ */
        /* session                                                      */
        /* ------------------------------------------------------------ */
        signIn: (email) => {
          const user = get().users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? get().users[0];
          set({
            session: {
              userId: user.id,
              authenticated: true,
              onboardingComplete: true,
              signedInAt: nowISO(),
            },
          });
        },
        signInWithOtp: () => {
          const user = get().users[0];
          set({
            session: { userId: user.id, authenticated: true, onboardingComplete: true, signedInAt: nowISO() },
          });
        },
        signUp: (name, email) => {
          const user: User = {
            id: uid('usr'),
            accountId: get().accountId,
            name,
            email,
            role: 'owner',
            companyIds: [],
            branchIds: [],
            avatarColor: '#007AFF',
            status: 'active',
            lastActiveAt: nowISO(),
          };
          set({
            users: [user, ...get().users],
            session: { userId: user.id, authenticated: true, onboardingComplete: false, signedInAt: nowISO() },
          });
        },
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
        saveCompany: (company) => {
          set({ companies: get().companies.map((c) => (c.id === company.id ? company : c)) });
          audit('updated', 'company', company.id, company.name);
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
            isPrimary: true,
          };
          const kinds: NumberingSeries['kind'][] = [
            'invoice', 'quote', 'salesOrder', 'delivery', 'salesReturn',
            'purchaseOrder', 'goodsReceipt', 'purchaseBill', 'purchaseReturn', 'payment', 'expense',
          ];
          const prefixes: Record<string, string> = {
            invoice: 'INV', quote: 'QT', salesOrder: 'SO', delivery: 'DN', salesReturn: 'CRN',
            purchaseOrder: 'PO', goodsReceipt: 'GRN', purchaseBill: 'BILL', purchaseReturn: 'DRN',
            payment: 'PAY', expense: 'EXP',
          };
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
            activeCompanyId: id,
            activeBranchId: branch.id,
          });
          return id;
        },
        saveBranch: (branch) => {
          const exists = get().branches.some((b) => b.id === branch.id);
          set({
            branches: exists
              ? get().branches.map((b) => (b.id === branch.id ? branch : b))
              : [...get().branches, branch],
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
          const exists = get().parties.some((p) => p.id === party.id);
          set({
            parties: exists ? get().parties.map((p) => (p.id === party.id ? party : p)) : [...get().parties, party],
          });
          audit(exists ? 'updated' : 'created', party.kind, party.id, party.name);
          return party.id;
        },
        removeParty: (id) => {
          const p = get().parties.find((x) => x.id === id);
          set({ parties: get().parties.filter((x) => x.id !== id) });
          if (p) audit('deleted', p.kind, id, p.name);
        },
        saveItem: (item) => {
          const exists = get().items.some((i) => i.id === item.id);
          set({ items: exists ? get().items.map((i) => (i.id === item.id ? item : i)) : [...get().items, item] });
          if (!exists && item.trackInventory && item.openingStock > 0) {
            const m: StockMovement = {
              id: uid('stk'),
              companyId: item.companyId,
              branchId: get().activeBranchId ?? 'brn_mum',
              itemId: item.id,
              type: 'opening',
              quantity: item.openingStock,
              unitCost: item.purchasePrice,
              date: today(),
              notes: 'Opening stock',
              createdBy: get().session.userId ?? CURRENT_USER_ID,
              createdAt: nowISO(),
            };
            set({ stockMovements: [...get().stockMovements, m] });
          }
          audit(exists ? 'updated' : 'created', 'item', item.id, item.name);
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
          const number = finalized ? consumeSeriesNumber(draft.kind, draft.date) : `${draft.kind.toUpperCase()}-DRAFT`;
          const party = s.parties.find((p) => p.id === draft.partyId);

          const doc: BusinessDocument = {
            id: uid(draft.kind),
            companyId: s.activeCompanyId,
            branchId: draft.branchId ?? s.activeBranchId ?? 'brn_mum',
            kind: draft.kind,
            number,
            status,
            partyId: draft.partyId,
            date: draft.date,
            dueDate: draft.dueDate,
            validUntil: draft.validUntil,
            reference: draft.reference,
            supplierDocNumber: draft.supplierDocNumber,
            currency: draft.currency,
            exchangeRate: draft.exchangeRate,
            lines: draft.lines,
            documentDiscountMode: draft.documentDiscountMode ?? 'percent',
            documentDiscountValue: draft.documentDiscountValue ?? 0,
            charges: draft.charges ?? zero(draft.currency),
            applyRoundOff: draft.applyRoundOff ?? draft.currency === 'INR',
            placeOfSupplyStateCode: draft.placeOfSupplyStateCode ?? party?.billingAddress.stateCode,
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
            createdBy: s.session.userId ?? CURRENT_USER_ID,
            createdAt: nowISO(),
            updatedAt: nowISO(),
          };
          doc.totals = computeTotals(doc);

          set({ documents: [doc, ...get().documents] });
          if (finalized) postStockFor(doc);
          audit(finalized ? 'finalized' : 'created', draft.kind, doc.id, doc.number);
          return doc.id;
        },

        updateDocument: (id, patch) => {
          const existing = get().documents.find((d) => d.id === id);
          if (!existing) return;
          const merged = { ...existing, ...patch, updatedAt: nowISO() };
          merged.totals = computeTotals(merged);
          set({ documents: get().documents.map((d) => (d.id === id ? merged : d)) });
          audit('updated', existing.kind, id, merged.number);
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
          if (!isFinalized(existing.status) && isFinalized(status)) {
            number = consumeSeriesNumber(existing.kind, existing.date);
          }
          const updated = { ...existing, status, number, updatedAt: nowISO() };
          set({ documents: get().documents.map((d) => (d.id === id ? updated : d)) });
          if (isFinalized(status)) postStockFor(updated);
          audit(`marked ${status}`, existing.kind, id, number);

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
              : existing.kind === 'quote'
                ? 'sent'
                : existing.kind === 'salesOrder' || existing.kind === 'purchaseOrder'
                  ? 'confirmed'
                  : existing.kind === 'delivery'
                    ? 'delivered'
                    : existing.kind === 'goodsReceipt'
                      ? 'received'
                      : 'issued';
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
            notes: src.notes,
            terms: src.terms,
            placeOfSupplyStateCode: src.placeOfSupplyStateCode,
            branchId: src.branchId,
            status: 'draft',
          });
        },

        convertDocument: (id, target) => {
          const src = get().documents.find((d) => d.id === id);
          if (!src) return '';
          const party = get().parties.find((p) => p.id === src.partyId);
          const newId = get().createDocument({
            kind: target,
            partyId: src.partyId,
            date: today(),
            dueDate:
              target === 'invoice' || target === 'purchaseBill'
                ? new Date(Date.now() + (party?.paymentTermsDays ?? 30) * 86400000).toISOString().slice(0, 10)
                : undefined,
            currency: src.currency,
            exchangeRate: src.exchangeRate,
            lines: src.lines.map((l) => ({ ...l, id: uid('ln') })),
            documentDiscountMode: src.documentDiscountMode,
            documentDiscountValue: src.documentDiscountValue,
            charges: src.charges,
            applyRoundOff: src.applyRoundOff,
            notes: src.notes,
            placeOfSupplyStateCode: src.placeOfSupplyStateCode,
            branchId: src.branchId,
            sourceDocumentId: src.id,
            status: 'draft',
          });
          audit(`converted to ${target}`, src.kind, src.id, src.number);
          return newId;
        },

        /* ------------------------------------------------------------ */
        /* payments                                                     */
        /* ------------------------------------------------------------ */
        savePayment: (payment) => {
          const exists = get().payments.some((p) => p.id === payment.id);
          const withNumber =
            payment.number && payment.number !== ''
              ? payment
              : { ...payment, number: consumeSeriesNumber('payment', payment.date) };

          set({
            payments: exists
              ? get().payments.map((p) => (p.id === payment.id ? withNumber : p))
              : [withNumber, ...get().payments],
          });

          // Refresh the status of every invoice/bill this payment touches.
          const affected = new Set(withNumber.allocations.map((a) => a.documentId));
          if (affected.size) {
            const payments = get().payments;
            set({
              documents: get().documents.map((d) => {
                if (!affected.has(d.id)) return d;
                const allocated = payments
                  .flatMap((p) => p.allocations)
                  .filter((a) => a.documentId === d.id)
                  .reduce((acc, a) => acc + a.amount.minor, 0);
                const outstanding = d.totals.grandTotal.minor - allocated;
                const status: DocStatus =
                  outstanding <= 0 ? 'paid' : allocated > 0 ? 'partiallyPaid' : d.status;
                return { ...d, status, updatedAt: nowISO() };
              }),
            });
          }

          audit(exists ? 'updated payment' : 'recorded payment', 'payment', withNumber.id, withNumber.number);
          if (!exists && withNumber.direction === 'received') {
            notify('paymentReceived', 'Payment recorded', `${withNumber.number} recorded successfully.`, 'payment', withNumber.id);
          }
          return withNumber.id;
        },

        removePayment: (id) => {
          const p = get().payments.find((x) => x.id === id);
          if (!p) return;
          const affected = new Set(p.allocations.map((a) => a.documentId));
          const remaining = get().payments.filter((x) => x.id !== id);
          set({
            payments: remaining,
            documents: get().documents.map((d) => {
              if (!affected.has(d.id)) return d;
              const allocated = remaining
                .flatMap((x) => x.allocations)
                .filter((a) => a.documentId === d.id)
                .reduce((acc, a) => acc + a.amount.minor, 0);
              const outstanding = d.totals.grandTotal.minor - allocated;
              const status: DocStatus = outstanding <= 0 ? 'paid' : allocated > 0 ? 'partiallyPaid' : 'issued';
              return { ...d, status, updatedAt: nowISO() };
            }),
          });
          audit('deleted payment', 'payment', id, p.number);
        },

        /* ------------------------------------------------------------ */
        /* expenses                                                     */
        /* ------------------------------------------------------------ */
        saveExpense: (expense) => {
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
        /* inventory                                                    */
        /* ------------------------------------------------------------ */
        addStockMovement: (m) => {
          const movement: StockMovement = {
            ...m,
            id: uid('stk'),
            createdBy: get().session.userId ?? CURRENT_USER_ID,
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
            createdBy: s.session.userId ?? CURRENT_USER_ID,
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
        addAttachment: (a) => {
          const attachment: Attachment = { ...a, id: uid('att'), uploadedAt: nowISO() };
          set({ attachments: [...get().attachments, attachment] });
          return attachment.id;
        },
        removeAttachment: (id) => set({ attachments: get().attachments.filter((a) => a.id !== id) }),
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
        retrySync: (id) =>
          set({ syncQueue: get().syncQueue.filter((q) => q.id !== id) }),
        clearSyncQueue: () => set({ syncQueue: [] }),

        /* ------------------------------------------------------------ */
        /* demo control                                                 */
        /* ------------------------------------------------------------ */
        resetDemoData: () => {
          const fresh = buildSeedData();
          set({
            ...fresh,
            activeCompanyId: PRIMARY_COMPANY_ID,
            activeBranchId: 'brn_mum',
          });
        },
      };
    },
    {
      name: 'ebs.data.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => {
        const { hydrated, ...rest } = s;
        void hydrated;
        return rest as AppState;
      },
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);
