import type { MaterialCommunityIcons } from '@expo/vector-icons';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export type TabName = 'index' | 'sales' | 'purchases' | 'inventory' | 'gst' | 'contacts' | 'reports' | 'more';

/**
 * The app's top-level destinations, in order. The phone shows them as a tab
 * bar, the web app as a sidebar. Names are resolved at render from
 * `nav:tab.<name>`, so both follow a language switch.
 */
export const TABS: { name: TabName; icon: IconName; activeIcon: IconName }[] = [
  { name: 'index', icon: 'home-outline', activeIcon: 'home' },
  { name: 'sales', icon: 'trending-up', activeIcon: 'trending-up' },
  { name: 'purchases', icon: 'cart-outline', activeIcon: 'cart' },
  { name: 'inventory', icon: 'package-variant-closed', activeIcon: 'package-variant' },
  { name: 'gst', icon: 'shield-check-outline', activeIcon: 'shield-check' },
  { name: 'contacts', icon: 'account-group-outline', activeIcon: 'account-group' },
  { name: 'reports', icon: 'chart-box-outline', activeIcon: 'chart-box' },
  { name: 'more', icon: 'dots-horizontal-circle-outline', activeIcon: 'dots-horizontal-circle' },
];

/** The URL a tab lives at, without route groups. */
export function tabPath(name: TabName): string {
  return name === 'index' ? '/' : `/${name}`;
}

/**
 * Which tab a pathname belongs to, so a screen deep in a stack still lights
 * up its section. Settings and the other More destinations fall under More.
 */
export function tabForPath(pathname: string): TabName {
  const first = pathname.split('/')[1] ?? '';
  switch (first) {
    case '':
      return 'index';
    case 'sales':
    case 'payments':
    case 'receivables':
      return 'sales';
    case 'purchases':
    case 'payables':
    case 'expenses':
    case 'ocr':
      return 'purchases';
    case 'inventory':
    case 'catalog':
      return 'inventory';
    case 'gst':
    case 'compliance':
      return 'gst';
    case 'contacts':
      return 'contacts';
    case 'reports':
      return 'reports';
    default:
      return 'more';
  }
}
