import { useQuery } from '@tanstack/react-query';
import { keepWithin } from './keepWithin';
import type { Schema } from '@esmart/api-client';
import { useAppStore } from '../store/appStore';
import { api } from './api';
import { queryClient } from './queries';

/**
 * A business's own names for other charges (Courier charges, Labour charges), offered beside the
 * built-in kinds on its documents only. Server only: adding one is a plain call that throws an
 * ApiError the screen toasts (a name it already has, say), then the list is fetched again.
 */

export type ChargeName = Schema<'ChargeName'>;

const companyId = () => useAppStore.getState().activeCompanyId;
export const chargeNameKeys = { all: (c: string) => ['chargeNames', c] as const };

/** The business's charge names, A to Z, hidden ones too (`status: 'inactive'`). */
export function useChargeNames(enabled = true) {
  const c = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: chargeNameKeys.all(c),
    enabled: !!c && enabled,
    placeholderData: keepWithin(c),
    queryFn: async () => (await api.GET('/companies/{companyId}/charge-names', { params: { path: { companyId: c } } })).data!.data,
  });
}

/** Adds a name to the business's list and hands it back. */
export async function addChargeName(name: string): Promise<ChargeName> {
  const c = companyId();
  const out = (await api.POST('/companies/{companyId}/charge-names', { params: { path: { companyId: c } }, body: { name } as ChargeName })).data!;
  queryClient.setQueryData<ChargeName[]>(chargeNameKeys.all(c), (rows) => [...(rows ?? []), out].sort((a, b) => a.name.localeCompare(b.name)));
  void queryClient.invalidateQueries({ queryKey: chargeNameKeys.all(c) });
  return out;
}
