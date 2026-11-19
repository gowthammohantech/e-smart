import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * A section's name, as the sidebar, tab bar, headers, More and search show it, on every plan.
 * `short` is the phone tab bar's name, where one is shorter (Parties).
 */
export function useSectionLabel() {
  const { t: tr } = useTranslation(['nav']);
  return useCallback(
    (name: string, short = false) => (short ? tr(`nav:tabBar.${name}` as 'nav:tabBar.contacts') : tr(`nav:tab.${name}` as 'nav:tab.index')),
    [tr],
  );
}
