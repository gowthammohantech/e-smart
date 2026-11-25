import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useHasModule } from '../store/selectors';

/**
 * A section's name, as the sidebar, tab bar, headers, More and search show it, on every plan.
 * `short` is the phone tab bar's name, where one is shorter. The contacts section is named for
 * who is in it: Customers on a plan that only sells, Customers / Suppliers once it buys too.
 */
export function useSectionLabel() {
  const { t: tr } = useTranslation(['nav']);
  const hasSuppliers = useHasModule('purchases');
  return useCallback(
    (name: string, short = false) => {
      if (name === 'parties' && !hasSuppliers) return tr('nav:tab.partiesCustomersOnly');
      return short ? tr(`nav:tabBar.${name}` as 'nav:tabBar.parties') : tr(`nav:tab.${name}` as 'nav:tab.index');
    },
    [tr, hasSuppliers],
  );
}
