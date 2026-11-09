import { useQuery } from '@tanstack/react-query';
import { keepWithin } from './keepWithin';
import type { Schema } from '@esmart/api-client';
import { useAppStore } from '../store/appStore';
import { api } from './api';
import { queryClient } from './queries';

/**
 * The fixed asset register (RULES 6.15). Server only: depreciation is worked out from the register on
 * the server, as the books are, so each write is a plain call that throws an ApiError the screen
 * toasts, then marks the register and the books stale.
 */

export type FixedAsset = Schema<'FixedAsset'>;
export type FixedAssetSchedule = Schema<'FixedAssetSchedule'>;

const companyId = () => useAppStore.getState().activeCompanyId;
export const fixedAssetKeys = {
  all: (c: string) => ['fixedAssets', c] as const,
  list: (c: string, status?: string) => ['fixedAssets', c, 'list', status ?? 'all'] as const,
  one: (c: string, id: string) => ['fixedAssets', c, 'one', id] as const,
  schedule: (c: string, from: string, to: string) => ['fixedAssets', c, 'schedule', from, to] as const,
};

function changed() {
  const c = companyId();
  for (const key of [fixedAssetKeys.all(c), ['books', c], ['reports', c]]) void queryClient.invalidateQueries({ queryKey: key });
}

export function useFixedAssets(status?: 'active' | 'disposed', enabled = true) {
  const c = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: fixedAssetKeys.list(c, status),
    enabled: !!c && enabled,
    placeholderData: keepWithin(c),
    queryFn: async () => (await api.GET('/companies/{companyId}/fixed-assets', { params: { path: { companyId: c }, query: { status } } })).data!.data,
  });
}

export function useFixedAsset(id: string | undefined) {
  const c = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: fixedAssetKeys.one(c, id ?? ''),
    enabled: !!c && !!id,
    queryFn: async () => (await api.GET('/companies/{companyId}/fixed-assets/{id}', { params: { path: { companyId: c, id: id! } } })).data!,
  });
}

export function useFixedAssetSchedule(range: { from: string; to: string; branchId?: string }) {
  const c = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: [...fixedAssetKeys.schedule(c, range.from, range.to), range.branchId ?? ''],
    enabled: !!c,
    placeholderData: keepWithin(c),
    queryFn: async () => (await api.GET('/companies/{companyId}/fixed-assets/schedule', { params: { path: { companyId: c }, query: range } })).data!,
  });
}

/** Adds an asset, or saves one (`version` given): its changes are refused if someone saved it since. */
export async function saveFixedAsset(body: FixedAsset): Promise<FixedAsset> {
  const c = companyId();
  const { id, version, ...rest } = body;
  const out = id
    ? (await api.PUT('/companies/{companyId}/fixed-assets/{id}', { params: { path: { companyId: c, id }, header: { 'If-Match': `"v${version}"` } }, body: rest as FixedAsset })).data!
    : (await api.POST('/companies/{companyId}/fixed-assets', { params: { path: { companyId: c } }, body: rest as FixedAsset })).data!;
  queryClient.setQueryData(fixedAssetKeys.one(c, out.id!), out);
  changed();
  return out;
}

export async function removeFixedAsset(asset: Pick<FixedAsset, 'id' | 'version'>): Promise<void> {
  const c = companyId();
  await api.DELETE('/companies/{companyId}/fixed-assets/{id}', { params: { path: { companyId: c, id: asset.id! }, header: { 'If-Match': `"v${asset.version}"` } } });
  changed();
}
