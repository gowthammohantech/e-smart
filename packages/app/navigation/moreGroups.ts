import { useTranslation } from 'react-i18next';
import type { IconName } from '@esmart/ui/components/Icon';
import { countLabel } from '@esmart/core/lib/format';
import { useCanOpen, useComplianceSummary, useModuleSet, useUnreadCount } from '../store/selectors';
import { useRemoteMeta } from '../remote/meta';
import { MENU, PHONE_TABS, SETTINGS, TOOLS, appHref, sectionPath, type MenuBadge, type MenuPage, type SectionName, type SettingsGroupKey } from './menu';

export type MoreEntry = {
  label: string;
  icon: IconName;
  route: string;
  badge?: string;
};

export type MoreGroupKey = SectionName | 'moreSections' | 'tools' | SettingsGroupKey;

export type MoreGroup = { key: MoreGroupKey; title: string; entries: MoreEntry[] };

/** Turns menu pages into entries: translated, badged, routed, and only what the plan opens. */
function useEntries() {
  const { t: tr } = useTranslation(['common', 'nav']);
  const unread = useUnreadCount();
  const offline = !useRemoteMeta((m) => m.online);
  const failed = useComplianceSummary().eInvoice.failed;
  const canOpen = useCanOpen();

  const badges: Record<MenuBadge, string | undefined> = {
    unread: unread ? countLabel(unread) : undefined,
    eInvoiceFailed: failed ? String(failed) : undefined,
    offline: offline ? tr('common:component.offline') : undefined,
  };
  return (pages: MenuPage[]): MoreEntry[] =>
    pages
      .filter((p) => canOpen(p.route))
      .map((p) => ({
        label: tr(p.labelKey as 'nav:title.invoices'),
        icon: p.icon,
        route: appHref(p.route),
        badge: p.badge ? badges[p.badge] : undefined,
      }));
}

/** The settings pages, grouped, minus what the plan can't open. */
export function useSettingsGroups(): MoreGroup[] {
  const { t: tr } = useTranslation(['nav']);
  const entries = useEntries();
  return SETTINGS.map((g) => ({ key: g.key, title: tr(g.labelKey as 'nav:more.group.account'), entries: entries(g.pages) })).filter(
    (g) => g.entries.length > 0,
  );
}

/**
 * Everything the phone's More tab lists: the sections that aren't on the tab
 * bar (with their pages, or as a row when they have none), the tools, then
 * the settings. All from `MENU`, minus what the plan can't open.
 */
export function useMoreGroups(): MoreGroup[] {
  const { t: tr } = useTranslation(['nav']);
  const entries = useEntries();
  const canOpen = useCanOpen();
  const onBar: readonly SectionName[] = PHONE_TABS[useModuleSet()];
  const settings = useSettingsGroups();

  const offBar = MENU.filter((s) => s.name !== 'more' && !onBar.includes(s.name));
  const sectionGroups: MoreGroup[] = offBar
    .filter((s) => s.pages.length > 0)
    .map((s) => ({ key: s.name, title: tr(`nav:tab.${s.name}` as 'nav:tab.index'), entries: entries(s.pages) }));
  const hubsOnly: MoreGroup = {
    key: 'moreSections',
    title: tr('nav:more.group.moreSections'),
    entries: offBar
      .filter((s) => s.pages.length === 0 && canOpen(sectionPath(s.name)))
      .map((s) => ({ label: tr(`nav:tab.${s.name}` as 'nav:tab.index'), icon: s.icon, route: appHref(sectionPath(s.name)) })),
  };
  const tools: MoreGroup = { key: 'tools', title: tr('nav:more.group.tools'), entries: entries(TOOLS) };
  // The More screen opens with its own profile card, so the list doesn't repeat it.
  const settingsHere = settings.map((g) => ({ ...g, entries: g.entries.filter((e) => e.route !== appHref('/settings/profile')) }));

  return [...sectionGroups, hubsOnly, tools, ...settingsHere].filter((g) => g.entries.length > 0);
}
