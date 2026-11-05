import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { IconName } from '@esmart/ui/components/Icon';
import { canOpen } from '@esmart/core/domain/plan';
import { useDisabledModules, usePlan } from '../store/selectors';
import { MENU, SETTINGS, TOOLS, appHref, sectionPath, type SettingsGroupKey } from './menu';
import type { TabName } from './tabs';

export type SubLink = { href: string; labelKey: string };

/**
 * The pages under each section, from `MENU`. The desktop sidebar shows them
 * under the open section; search finds them by name on every platform.
 */
export const SECTION_LINKS: Partial<Record<TabName, SubLink[]>> = Object.fromEntries(
  MENU.filter((s) => s.pages.length > 0).map((s) => [s.name, s.pages.map((p) => ({ href: p.route, labelKey: p.labelKey }))]),
);

/** Where the desktop's Settings entry opens: the first settings page. */
export const SETTINGS_HREF = SETTINGS[0].pages[0].route;

/** The groups that make up Settings (the desktop's settings navigation). */
export const SETTINGS_GROUPS: readonly SettingsGroupKey[] = SETTINGS.map((g) => g.key);

export type AppPage = {
  key: string;
  title: string;
  /** Where it sits, e.g. "Sell" or "Settings · Account". */
  subtitle?: string;
  icon: IconName;
  route: string;
};

/**
 * Every page a person can navigate to — the sections, the pages under them,
 * the tools and the settings — minus what the plan can't open. One entry per
 * page, in menu order.
 */
export function useAppPages(): AppPage[] {
  const { t: tr } = useTranslation(['nav']);
  const plan = usePlan();
  const disabled = useDisabledModules();

  return useMemo(() => {
    const list: AppPage[] = [];
    const add = (page: AppPage) => canOpen(plan, page.route, disabled) && list.push({ ...page, route: appHref(page.route) });

    MENU.filter((s) => s.name !== 'more').forEach((s) => {
      const name = tr(`nav:tab.${s.name}` as 'nav:tab.index');
      add({ key: `tab-${s.name}`, title: name, icon: s.icon, route: sectionPath(s.name) });
      s.pages.forEach((p) =>
        add({
          key: p.route,
          title: tr(p.labelKey as 'nav:title.invoices'),
          // "Sell · Adjustments": the section and, where it has one, the category inside it.
          subtitle: p.group ? `${name} · ${tr(`nav:menuGroup.${p.group}`)}` : name,
          icon: p.icon,
          route: p.route,
        }),
      );
    });

    const tools = tr('nav:more.group.tools');
    TOOLS.forEach((p) => add({ key: p.route, title: tr(p.labelKey as 'nav:title.invoices'), subtitle: tools, icon: p.icon, route: p.route }));

    // "Settings · Account", so searching "settings" finds them too.
    const settings = tr('nav:shell.settings');
    SETTINGS.forEach((g) => {
      const subtitle = `${settings} · ${tr(g.labelKey as 'nav:more.group.account')}`;
      g.pages.forEach((p) => add({ key: p.route, title: tr(p.labelKey as 'nav:title.invoices'), subtitle, icon: p.icon, route: p.route }));
    });

    return list;
  }, [tr, plan, disabled]);
}

/** Pages whose name matches, then pages in a matching section ("sales" finds the Sales pages). */
export function matchPages(pages: AppPage[], query: string, limit = 8): AppPage[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const byTitle = pages.filter((p) => p.title.toLowerCase().includes(q));
  const bySection = pages.filter((p) => !byTitle.includes(p) && p.subtitle?.toLowerCase().includes(q));
  return [...byTitle, ...bySection].slice(0, limit);
}
