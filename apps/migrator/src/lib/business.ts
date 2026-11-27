import { api } from './api';
import type { Ctx } from './kit';
import type { Business } from '../types';

/** Reads what the business needs for an import: its currency, tax rates, chart of accounts and whether it keeps stock. */
export async function loadBusiness(id: string): Promise<Business> {
  const company = await api().GET('/companies/{companyId}', { params: { path: { companyId: id } } });
  if (!company.data) throw new Error('That business could not be opened.');
  const tax = await api().GET('/companies/{companyId}/tax-categories', { params: { path: { companyId: id } } });
  const c = company.data as { name: string; baseCurrency: string; disabledModules?: string[]; plan?: string; fiscalYearStartMonth?: number };
  // The chart is the Books module's; without it journals can't be read, and the rest still works.
  const chart = await api()
    .GET('/companies/{companyId}/books/{view}', { params: { path: { companyId: id, view: 'accounts' }, query: { to: new Date().toISOString().slice(0, 10) } as never } })
    .then((res) => (res.data as { accounts?: { key: string; name: string }[] } | undefined)?.accounts ?? [])
    .catch(() => []);
  // What the plan includes, so a sheet it cannot import is said so before the check, not found out row by row.
  const tier = c.plan
    ? await api()
        .GET('/plans')
        .then((res) => ((res.data as { data?: { key: string; name: string; modules?: string[] }[] } | undefined)?.data ?? []).find((p) => p.key === c.plan))
        .catch(() => undefined)
    : undefined;
  const ctx: Ctx = {
    currency: c.baseCurrency,
    taxCategories: (tax.data?.data ?? []) as unknown as Ctx['taxCategories'],
    trackInventory: !(c.disabledModules ?? []).includes('inventory'),
    accounts: chart.map((a) => ({ key: a.key, name: a.name })),
    fiscalYearStartMonth: c.fiscalYearStartMonth ?? 4,
    ...(tier?.modules && { modules: tier.modules.filter((m) => !(c.disabledModules ?? []).includes(m)), planName: `the ${tier.name} plan` }),
  };
  return { id, name: c.name, ctx, plan: c.plan };
}
