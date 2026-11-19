import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useHasModule } from '../store/selectors';

/**
 * A section's name, as the sidebar, tab bar, headers, More and search show it. Parties is
 * "Customers" on a plan without purchases (Free, Basic): there are no suppliers there to make
 * them parties. `short` is the phone tab bar's name, where one is shorter.
 */
export function useSectionLabel() {
  const { t: tr } = useTranslation(['nav']);
  const customersOnly = !useHasModule('purchases');
  return useCallback(
    (name: string, short = false) => {
      if (name === 'contacts' && customersOnly) return tr('nav:tab.customersOnly');
      return short ? tr(`nav:tabBar.${name}` as 'nav:tabBar.contacts') : tr(`nav:tab.${name}` as 'nav:tab.index');
    },
    [tr, customersOnly],
  );
}
