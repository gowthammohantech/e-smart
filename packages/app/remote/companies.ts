import type { Company, NumberingSeries } from '@esmart/core/types';
import { useAppStore } from '../store/appStore';
import { api } from './api';
import { applyEntity } from './apply';
import { loadCompany } from './refresh';

/** What a new business is created with: its profile, and the numbering chosen at setup. */
export type NewBusiness = Omit<Company, 'id' | 'accountId' | 'createdAt' | 'plan' | 'logoUri' | 'signatureUri'>;
export type SeriesChoice = Pick<NumberingSeries, 'kind' | 'prefix' | 'nextNumber' | 'padding' | 'includeFiscalYear' | 'includeBranchCode' | 'resetPolicy'>;

/**
 * Creates a business on the server and opens it here: the server makes it (on the Free plan, with
 * its branch, tax rates, numbering and accounts), its setup is loaded, and it becomes the open
 * business. Nothing is made on the device first, so there is no copy for a refresh to drop while
 * the server is still making it. `idempotencyKey` makes a retry return the same business.
 * Throws when the server refuses it or can't be reached.
 */
export async function createBusiness(business: NewBusiness, numberingSeries: SeriesChoice[], idempotencyKey: string): Promise<string> {
  const { data } = await api.POST('/companies', {
    body: { ...business, seedDefaults: true, numberingSeries } as never,
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  const company = data as Company | undefined;
  if (!company?.id) throw new Error('The server returned no business');
  applyEntity('company', company);
  await loadCompany(company.id);
  useAppStore.getState().setActiveCompany(company.id);
  return company.id;
}
