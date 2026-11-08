import { appHref, pageForPath } from './menu';
import { tabForPath, tabPath } from './tabs';

/**
 * Where a screen opened with nothing beneath it (a refresh, a shared link, a notification) goes
 * back to: the list it belongs to (`/sales/invoices/42` → Invoices), or its section's hub when it
 * is that list or isn't in the menu.
 */
export function hubFor(pathname: string): string {
  const path = pathname.split('?')[0].replace(/\/+$/, '') || '/';
  const page = pageForPath(path);
  if (page && page.route !== path) return appHref(page.route);
  return appHref(tabPath(tabForPath(path)));
}
