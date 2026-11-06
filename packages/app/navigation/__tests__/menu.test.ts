import { canOpen } from '@esmart/core/domain/plan';
import { MENU, PHONE_TABS, SETTINGS, TOOLS, appHref, pageForPath, sectionPath } from '../menu';
import { tabForPath } from '../tabs';

const sectionPages = MENU.flatMap((s) => s.pages.map((p) => ({ section: s.name, ...p })));
const allPages = [...sectionPages, ...TOOLS, ...SETTINGS.flatMap((g) => g.pages)];

describe('the menu', () => {
  it('lists every page once', () => {
    const routes = allPages.map((p) => p.route);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('lights up the section a page is filed under', () => {
    sectionPages.forEach((p) => expect([p.route, tabForPath(p.route)]).toEqual([p.route, p.section]));
    MENU.forEach((s) => expect(tabForPath(sectionPath(s.name))).toBe(s.name));
  });

  it('files the tools and settings under More', () => {
    [...TOOLS, ...SETTINGS.flatMap((g) => g.pages)].forEach((p) => expect(tabForPath(p.route)).toBe('more'));
  });

  it('routes hubs as tabs and pages inside the app group', () => {
    expect(appHref('/')).toBe('/(app)/(tabs)');
    expect(appHref('/money')).toBe('/(app)/(tabs)/money');
    expect(appHref('/sales/invoices')).toBe('/(app)/sales/invoices');
    expect(appHref('/settings/company')).toBe('/(app)/settings/company');
  });

  it('gives the Sales plan Money without the money-out pages', () => {
    const money = MENU.find((s) => s.name === 'money')!.pages.filter((p) => canOpen('free', p.route)).map((p) => p.key);
    // Adjusting advances is a payments screen, open like payments (plan.ts), though it sits under /receipts.
    expect(money).toEqual(['paymentsIn', 'advanceReceipt', 'adjustAdvance', 'receivables']);
    expect(PHONE_TABS.sales).toEqual(['index', 'sales', 'gst', 'more']);
  });

  it('keeps every full-plan page open on the full plan', () => {
    allPages.forEach((p) => expect([p.route, canOpen('pro', p.route)]).toEqual([p.route, true]));
  });

  it('files a sectioned page under a category in every section that uses them', () => {
    MENU.forEach((s) => {
      const lists = s.pages.filter((p) => !p.action);
      const grouped = lists.filter((p) => p.group).length;
      // All or nothing, so a panel never shows a category beside a loose page.
      expect([s.name, grouped === 0 || grouped === lists.length]).toEqual([s.name, true]);
    });
  });

  it('opens a new one from inside the page it lists', () => {
    sectionPages.filter((p) => p.createRoute).forEach((p) => expect([p.key, tabForPath(p.createRoute!.split('?')[0])]).toEqual([p.key, p.section]));
  });

  it('finds the page a deep link is on', () => {
    expect(pageForPath('/sales/invoices')?.key).toBe('invoices');
    expect(pageForPath('/sales/invoices/abc/edit')?.key).toBe('invoices');
    expect(pageForPath('/settings/company')?.key).toBe('company');
    expect(pageForPath('/sales')).toBeUndefined();
    expect(pageForPath('/sales/invoicesx')).toBeUndefined();
    // A capture is a step, not a place to come back to.
    expect(pageForPath('/ocr/capture')).toBeUndefined();
  });
});
