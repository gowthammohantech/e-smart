import { canOpen } from '@esmart/core/domain/plan';
import { MENU, PHONE_TABS, SETTINGS, TOOLS, appHref, sectionPath } from '../menu';
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
    expect(money).toEqual(['paymentsIn', 'receivables']);
    expect(PHONE_TABS.sales).toEqual(['index', 'sales', 'gst', 'more']);
  });

  it('keeps every full-plan page open on the full plan', () => {
    allPages.forEach((p) => expect([p.route, canOpen('pro', p.route)]).toEqual([p.route, true]));
  });
});
