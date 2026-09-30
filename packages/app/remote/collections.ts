import type { AppData } from '../store/appStore';

/**
 * How the server's entity types map onto the store. `entityType` strings are
 * the ones the API writes to its change log (apps/api/src/modules/sync/entities.ts).
 * `key` is the field that identifies a row: most use `id`; one-per-company
 * records use `companyId`.
 */
export type CollectionKey = Exclude<keyof AppData, 'accountId'>;

export const COLLECTIONS: Record<string, { collection: CollectionKey; key: 'id' | 'companyId' }> = {
  company: { collection: 'companies', key: 'id' },
  branch: { collection: 'branches', key: 'id' },
  user: { collection: 'users', key: 'id' },
  party: { collection: 'parties', key: 'id' },
  item: { collection: 'items', key: 'id' },
  tax_category: { collection: 'taxCategories', key: 'id' },
  expense_category: { collection: 'expenseCategories', key: 'id' },
  payment_account: { collection: 'paymentAccounts', key: 'id' },
  exchange_rate: { collection: 'exchangeRates', key: 'id' },
  numbering_series: { collection: 'numberingSeries', key: 'id' },
  transporter: { collection: 'transporters', key: 'id' },
  document: { collection: 'documents', key: 'id' },
  payment: { collection: 'payments', key: 'id' },
  expense: { collection: 'expenses', key: 'id' },
  eway_bill: { collection: 'ewayBills', key: 'id' },
  attachment: { collection: 'attachments', key: 'id' },
  integration: { collection: 'integrations', key: 'id' },
  compliance_settings: { collection: 'complianceSettings', key: 'companyId' },
};

/** Collections every new company starts with; the server creates its own copies. */
export const COMPANY_DEFAULTS: CollectionKey[] = ['branches', 'numberingSeries', 'taxCategories', 'expenseCategories', 'paymentAccounts', 'complianceSettings'];

export const companyPath = (companyId: string) => `/companies/${encodeURIComponent(companyId)}`;
