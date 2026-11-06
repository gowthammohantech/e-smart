import { useTranslation } from 'react-i18next';
import type { HubTile } from '@esmart/ui/components/HubTiles';
import { useCanOpen } from '../store/selectors';
import { appHref, section, type SectionName } from './menu';

/**
 * A section's pages as hub tiles, in menu order, minus what the plan can't
 * open. `counts` puts a number on a tile by page key; `skip` leaves pages
 * out (a hub that already shows one of its pages inline).
 */
export function useSectionTiles(name: SectionName, counts: Record<string, number | undefined> = {}, skip: string[] = []): HubTile[] {
  const { t: tr } = useTranslation(['nav']);
  const canOpen = useCanOpen();
  return section(name)
    .pages.filter((p) => !skip.includes(p.key) && canOpen(p.route))
    .map((p) => ({ key: p.key, label: tr(p.labelKey as 'nav:title.invoices'), icon: p.icon, route: appHref(p.route), count: counts[p.key] }));
}
