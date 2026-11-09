import { useQuery } from '@tanstack/react-query';
import { keepWithin } from './keepWithin';
import type { Schema } from '@esmart/api-client';
import { useAppStore } from '../store/appStore';
import { api } from './api';
import { queryClient } from './queries';

/** Budgets (RULES 6.16). Server only, as the books they are set against are. */

export type Budget = Schema<'Budget'>;
export type BudgetVariance = Schema<'BudgetVariance'>;

const companyId = () => useAppStore.getState().activeCompanyId;
const keys = {
  all: (c: string) => ['budgets', c] as const,
  one: (c: string, id: string) => ['budgets', c, 'one', id] as const,
  variance: (c: string, id: string, from?: string, to?: string) => ['budgets', c, 'variance', id, from ?? '', to ?? ''] as const,
};

export function useBudgets() {
  const c = useAppStore((s) => s.activeCompanyId);
  return useQuery({ queryKey: [...keys.all(c), 'list'], enabled: !!c, queryFn: async () => (await api.GET('/companies/{companyId}/budgets', { params: { path: { companyId: c } } })).data!.data });
}

export function useBudget(id: string | undefined) {
  const c = useAppStore((s) => s.activeCompanyId);
  return useQuery({ queryKey: keys.one(c, id ?? ''), enabled: !!c && !!id, queryFn: async () => (await api.GET('/companies/{companyId}/budgets/{id}', { params: { path: { companyId: c, id: id! } } })).data! });
}

export function useBudgetVariance(id: string | undefined, range?: { from: string; to: string }) {
  const c = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: keys.variance(c, id ?? '', range?.from, range?.to),
    enabled: !!c && !!id,
    placeholderData: keepWithin(c),
    queryFn: async () => (await api.GET('/companies/{companyId}/budgets/{id}/variance', { params: { path: { companyId: c, id: id! }, query: range } })).data!,
  });
}

export async function saveBudget(body: Budget): Promise<Budget> {
  const c = companyId();
  const { id, version, ...rest } = body;
  const out = id
    ? (await api.PUT('/companies/{companyId}/budgets/{id}', { params: { path: { companyId: c, id }, header: { 'If-Match': `"v${version}"` } }, body: rest as Budget })).data!
    : (await api.POST('/companies/{companyId}/budgets', { params: { path: { companyId: c } }, body: rest as Budget })).data!;
  void queryClient.invalidateQueries({ queryKey: keys.all(c) });
  return out;
}

export async function removeBudget(b: Pick<Budget, 'id' | 'version'>): Promise<void> {
  const c = companyId();
  await api.DELETE('/companies/{companyId}/budgets/{id}', { params: { path: { companyId: c, id: b.id! }, header: { 'If-Match': `"v${b.version}"` } } });
  void queryClient.invalidateQueries({ queryKey: keys.all(c) });
}
