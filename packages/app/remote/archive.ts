import { useQuery } from '@tanstack/react-query';
import type { Schema } from '@esmart/api-client';
import { useAppStore } from '../store/appStore';
import { api } from './api';
import { useRemoteMeta } from './meta';
import { queryClient } from './queries';
import { syncNow } from './sync';

const ARCHIVED = ['companies', 'archived'] as const;

/**
 * Archives a business on the server, then drops it from this device and opens another. Throws (and
 * changes nothing here) when the server refuses: the wrong name or password, the last open business,
 * or a subscription that couldn't be cancelled.
 */
export async function archiveCompany(companyId: string, body: Schema<'ArchiveCompanyRequest'>) {
  await api.POST('/companies/{companyId}/archive', { params: { path: { companyId } }, body });
  useAppStore.getState().forgetCompany(companyId);
  void queryClient.invalidateQueries({ queryKey: ARCHIVED });
}

/** Brings an archived business back; the next sync pulls its books onto this device. */
export async function restoreCompany(companyId: string) {
  await api.POST('/companies/{companyId}/restore', { params: { path: { companyId } } });
  void queryClient.invalidateQueries({ queryKey: ARCHIVED });
  await syncNow();
}

/** The account's archived businesses, read from the server (they are never kept on the device). */
export function useArchivedCompanies(enabled: boolean) {
  const online = useRemoteMeta((m) => m.online);
  return useQuery({
    queryKey: ARCHIVED,
    enabled: enabled && online,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies', { params: { query: { archived: true } }, signal });
      return (data?.data ?? []) as Schema<'Company'>[];
    },
  });
}
