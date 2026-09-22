import { useEffect } from 'react';
import { useItems, useParties } from '@/store/selectors';
import { syncIntentEntities } from './bridge';

/**
 * Mirrors the active company's customers and items to iOS so Siri and
 * Shortcuts can offer them. Switching company re-syncs on its own; leaving
 * the signed-in app clears the list so no customer names linger.
 */
export function useIntentEntitySync() {
  const customers = useParties('customer');
  const items = useItems({ activeOnly: true });

  useEffect(() => {
    const timer = setTimeout(() => {
      syncIntentEntities(
        customers
          .filter((p) => p.status === 'active')
          .map((p) => ({ id: p.id, name: p.displayName || p.name, code: p.code })),
        items.map((i) => ({ id: i.id, name: i.name, unit: i.unit })),
      );
    }, 500);
    return () => clearTimeout(timer);
  }, [customers, items]);

  useEffect(() => () => syncIntentEntities([], []), []);
}
