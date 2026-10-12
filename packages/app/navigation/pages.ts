import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { MaterialCommunityIcons } from '@expo/vector-icons';
import { canOpen } from '@esmart/core/domain/plan';
import { usePlan } from '../store/selectors';
import { TABS, tabPath, type TabName } from './tabs';
import { useMoreGroups, type MoreGroupKey } from './moreGroups';

export type SubLink = { href: string; labelKey: string };

/**
 * The pages under each section. The desktop sidebar shows them under the
 * open section; search finds them by name on every platform.
 */
export const SECTION_LINKS: Partial<Record<TabName, SubLink[]>> = {
  sales: [
    { href: '/sales/invoices', labelKey: 'nav:title.invoices' },
    { href: '/sales/quotes', labelKey: 'nav:title.quotations' },
    { href: '/sales/orders', labelKey: 'nav:title.salesOrders' },
    { href: '/sales/deliveries', labelKey: 'nav:title.deliveryNotes' },
    { href: '/sales/returns', labelKey: 'nav:title.salesReturns' },
    { href: '/payments/received', labelKey: 'nav:title.paymentsReceived' },
    { href: '/receivables', labelKey: 'nav:title.receivables' },
  ],
  purchases: [
    { href: '/purchases/bills', labelKey: 'nav:title.purchaseBills' },
    { href: '/purchases/orders', labelKey: 'nav:title.purchaseOrders' },
    { href: '/purchases/receipts', labelKey: 'nav:title.goodsReceipts' },
    { href: '/purchases/returns', labelKey: 'nav:title.purchaseReturns' },
    { href: '/payments/made', labelKey: 'nav:title.paymentsMade' },
    { href: '/payables', labelKey: 'nav:title.payables' },
    { href: '/expenses', labelKey: 'nav:title.expenses' },
  ],
  inventory: [
    { href: '/catalog/items', labelKey: 'nav:title.itemsAndServices' },
    { href: '/inventory/movements', labelKey: 'nav:title.stockMovements' },
    { href: '/inventory/low-stock', labelKey: 'nav:title.lowStock' },
  ],
  gst: [
    { href: '/compliance', labelKey: 'nav:more.entry.gstCompliance' },
    { href: '/gst/gstr1', labelKey: 'nav:title.gstr1' },
  ],
};

/** Where the desktop sidebar's Settings entry opens. */
export const SETTINGS_HREF = '/settings/company';

/** The More groups that make up Settings (the desktop's settings navigation). */
export const SETTINGS_GROUPS = ['businessSetup', 'dataCompliance', 'account'] as const satisfies readonly MoreGroupKey[];

export type AppPage = {
  key: string;
  title: string;
  /** The section it sits in, e.g. "Sell". */
  subtitle?: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  route: string;
};

/**
 * Every page a person can navigate to: the sections, the pages under them,
 * and the More / settings entries (only `groups`, when given), minus what
 * the plan can't open. One entry per page.
 */
export function useAppPages(groups?: readonly MoreGroupKey[]): AppPage[] {
  const { t: tr } = useTranslation(['nav']);
  const plan = usePlan();
  const moreGroups = useMoreGroups();

  return useMemo(() => {
    const list = new Map<string, AppPage>();
    // `/(app)/gst/gstr1` and `/gst/gstr1` are the same page.
    const add = (page: AppPage) => {
      const at = page.route.replace(/\/\([^)]+\)/g, '') || '/';
      if (!list.has(at)) list.set(at, page);
    };

    TABS.filter((tab) => tab.name !== 'more' && canOpen(plan, tabPath(tab.name))).forEach((tab) => {
      const section = tr(`nav:tab.${tab.name}` as 'nav:tab.index');
      add({ key: `tab-${tab.name}`, title: section, icon: tab.icon, route: tabPath(tab.name) });
      (SECTION_LINKS[tab.name] ?? [])
        .filter((l) => canOpen(plan, l.href))
        .forEach((l) => add({ key: l.href, title: tr(l.labelKey as 'nav:title.invoices'), subtitle: section, icon: tab.icon, route: l.href }));
    });

    const settings = tr('nav:shell.settings');
    moreGroups
      .filter((g) => !groups || groups.includes(g.key))
      .forEach((g) => {
        // "Settings · Business setup", so searching "settings" finds them too.
        const subtitle = (SETTINGS_GROUPS as readonly string[]).includes(g.key) ? `${settings} · ${g.title}` : g.title;
        g.entries.forEach((e) => add({ key: e.route, title: e.label, subtitle, icon: e.icon, route: e.route }));
      });

    return Array.from(list.values());
  }, [tr, plan, moreGroups, groups]);
}

/** Pages whose name matches, then pages in a matching section ("sales" finds the Sales pages). */
export function matchPages(pages: AppPage[], query: string, limit = 8): AppPage[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const byTitle = pages.filter((p) => p.title.toLowerCase().includes(q));
  const bySection = pages.filter((p) => !byTitle.includes(p) && p.subtitle?.toLowerCase().includes(q));
  return [...byTitle, ...bySection].slice(0, limit);
}
