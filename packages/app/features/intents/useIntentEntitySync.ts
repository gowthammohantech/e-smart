import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../remote/api';
import { useAppStore } from '../../store/appStore';
import { syncIntentEntities } from './bridge';

/**
 * Mirrors the active company's customers and items to iOS so Siri and
 * Shortcuts can offer them, read from the server (the device keeps only what
 * it has opened). Switching company re-syncs on its own; leaving the
 * signed-in app clears the list so no customer names linger.
 */
export function useIntentEntitySync() {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const { data } = useQuery({
    queryKey: ['intents', companyId],
    // Only iOS has Siri and Shortcuts to offer them to.
    enabled: !!companyId && Platform.OS === 'ios',
    staleTime: 30 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const [parties, items] = await Promise.all([
        api.GET('/companies/{companyId}/parties', { params: { path: { companyId }, query: { kind: 'customer', limit: 200 } }, signal }),
        api.GET('/companies/{companyId}/items', { params: { path: { companyId }, query: { status: 'active', limit: 200 } }, signal }),
      ]);
      return { customers: parties.data?.data ?? [], items: items.data?.data ?? [] };
    },
  });

  useEffect(() => {
    if (!data) return;
    syncIntentEntities(
      data.customers
        .filter((p) => p.status !== 'inactive')
        .map((p) => ({ id: p.id!, name: p.displayName || p.name!, code: p.code ?? '' })),
      data.items.map((i) => ({ id: i.id!, name: i.name!, unit: i.unit! })),
    );
  }, [data]);

  useEffect(() => () => syncIntentEntities([], []), []);
}
