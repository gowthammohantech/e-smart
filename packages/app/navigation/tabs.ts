import type { IconName } from '@esmart/ui/components/Icon';
import { MENU, sectionPath, type SectionName } from './menu';

export type TabName = SectionName;

/**
 * The app's top-level destinations, in order (see `MENU`). The phone shows
 * some as a tab bar and reaches the rest through More; the web app lists them
 * in its sidebar. Names are resolved at render from `nav:tab.<name>`, so both
 * follow a language switch.
 */
export const TABS: { name: TabName; icon: IconName; activeIcon: IconName }[] = MENU.map(({ name, icon, activeIcon }) => ({ name, icon, activeIcon }));

/** The URL a tab lives at, without route groups. */
export const tabPath = sectionPath;

/**
 * Which section a pathname belongs to, so a screen deep in a stack still
 * lights up its section. Settings and the tools fall under More.
 */
export function tabForPath(pathname: string): TabName {
  const [, first = ''] = pathname.split('/');
  switch (first) {
    case '':
      return 'index';
    case 'sales':
      return 'sales';
    case 'purchases':
    case 'ocr':
      return 'purchases';
    case 'inventory':
    case 'catalog':
      return 'inventory';
    case 'money':
    case 'payments':
    case 'receipts':
    case 'receivables':
    case 'payables':
    case 'expenses':
    case 'books':
      return 'money';
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
