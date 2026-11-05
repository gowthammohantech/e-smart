import type { IconName } from '@esmart/ui/components/Icon';

/**
 * The app's whole menu, in one place: the sections and the pages under each,
 * the tools, and the settings pages. The phone's tab bar and More screen, the
 * hub tiles, the desktop sidebar, its settings list and search all read this,
 * so a page moved here moves everywhere. Labels are i18n keys, resolved at
 * render; what a plan can't open is filtered out where it's shown (`canOpen`).
 */

export type SectionName = 'index' | 'sales' | 'purchases' | 'inventory' | 'money' | 'gst' | 'contacts' | 'reports' | 'more';

/** A live count shown beside an entry, resolved by `useMenuBadges`. */
export type MenuBadge = 'unread' | 'eInvoiceFailed' | 'offline';

export type MenuPage = {
  key: string;
  labelKey: string;
  icon: IconName;
  /** Without route groups, as the browser shows it. */
  route: string;
  badge?: MenuBadge;
};

/** The small headings the desktop sidebar files sections under; `null` sits above them all. */
export type SidebarGroup = 'transactions' | 'finance' | 'manage' | null;

export type MenuSection = {
  name: SectionName;
  icon: IconName;
  activeIcon: IconName;
  sidebarGroup: SidebarGroup;
  pages: MenuPage[];
};

export const MENU: MenuSection[] = [
  { name: 'index', icon: 'home-outline', activeIcon: 'home', sidebarGroup: null, pages: [] },
  {
    name: 'sales',
    icon: 'trending-up',
    activeIcon: 'trending-up',
    sidebarGroup: 'transactions',
    pages: [
      { key: 'invoices', labelKey: 'nav:title.invoices', icon: 'file-document-outline', route: '/sales/invoices' },
      { key: 'quotes', labelKey: 'nav:title.quotations', icon: 'file-percent-outline', route: '/sales/quotes' },
      { key: 'salesOrders', labelKey: 'nav:title.salesOrders', icon: 'clipboard-list-outline', route: '/sales/orders' },
      { key: 'deliveries', labelKey: 'nav:title.deliveryNotes', icon: 'truck-outline', route: '/sales/deliveries' },
      { key: 'salesReturns', labelKey: 'nav:title.salesReturns', icon: 'keyboard-return', route: '/sales/returns' },
      { key: 'creditNotes', labelKey: 'nav:title.creditNotes', icon: 'file-document-minus-outline', route: '/sales/credit-notes' },
      { key: 'debitNotes', labelKey: 'nav:title.debitNotes', icon: 'file-document-plus-outline', route: '/sales/debit-notes' },
    ],
  },
  {
    name: 'purchases',
    icon: 'cart-outline',
    activeIcon: 'cart',
    sidebarGroup: 'transactions',
    pages: [
      { key: 'bills', labelKey: 'nav:title.purchaseBills', icon: 'file-document-outline', route: '/purchases/bills' },
      { key: 'purchaseOrders', labelKey: 'nav:title.purchaseOrders', icon: 'clipboard-list-outline', route: '/purchases/orders' },
      { key: 'goodsReceipts', labelKey: 'nav:title.goodsReceipts', icon: 'package-down', route: '/purchases/receipts' },
      { key: 'purchaseReturns', labelKey: 'nav:title.purchaseReturns', icon: 'package-up', route: '/purchases/returns' },
      { key: 'supplierCreditNotes', labelKey: 'nav:title.supplierCreditNotes', icon: 'file-document-minus-outline', route: '/purchases/credit-notes' },
      { key: 'supplierDebitNotes', labelKey: 'nav:title.supplierDebitNotes', icon: 'file-document-plus-outline', route: '/purchases/debit-notes' },
      { key: 'scanBill', labelKey: 'nav:title.scanABill', icon: 'text-recognition', route: '/ocr/capture' },
    ],
  },
  {
    name: 'inventory',
    icon: 'package-variant-closed',
    activeIcon: 'package-variant',
    sidebarGroup: 'transactions',
    pages: [
      { key: 'items', labelKey: 'nav:title.itemsAndServices', icon: 'package-variant', route: '/catalog/items' },
      { key: 'movements', labelKey: 'nav:title.stockMovements', icon: 'swap-horizontal', route: '/inventory/movements' },
      { key: 'lowStock', labelKey: 'nav:title.lowStock', icon: 'alert-outline', route: '/inventory/low-stock' },
    ],
  },
  {
    name: 'money',
    icon: 'wallet-outline',
    activeIcon: 'wallet',
    sidebarGroup: 'finance',
    pages: [
      { key: 'accountsHub', labelKey: 'reports:dash.accounts.open', icon: 'scale-balance', route: '/accounts' },
      { key: 'paymentsIn', labelKey: 'nav:title.paymentsReceived', icon: 'cash-plus', route: '/payments/received' },
      { key: 'paymentsOut', labelKey: 'nav:title.paymentsMade', icon: 'cash-minus', route: '/payments/made' },
      { key: 'receipts', labelKey: 'nav:title.receipts', icon: 'receipt', route: '/receipts' },
      { key: 'receivables', labelKey: 'nav:title.receivables', icon: 'clock-alert-outline', route: '/receivables' },
      { key: 'payables', labelKey: 'nav:title.payables', icon: 'file-clock-outline', route: '/payables' },
      { key: 'expenses', labelKey: 'nav:title.expenses', icon: 'receipt-text-outline', route: '/expenses' },
      { key: 'books', labelKey: 'nav:more.entry.books', icon: 'book-open-page-variant-outline', route: '/books' },
    ],
  },
  {
    name: 'gst',
    icon: 'shield-check-outline',
    activeIcon: 'shield-check',
    sidebarGroup: 'finance',
    pages: [
      { key: 'compliance', labelKey: 'nav:more.entry.gstCompliance', icon: 'shield-check-outline', route: '/compliance', badge: 'eInvoiceFailed' },
      { key: 'gstr1', labelKey: 'nav:title.gstr1', icon: 'file-send-outline', route: '/gst/gstr1' },
      { key: 'gstr2b', labelKey: 'nav:title.gstr2b', icon: 'file-compare', route: '/gst/gstr2b' },
      { key: 'gstReturns', labelKey: 'nav:title.gstReturns', icon: 'file-certificate-outline', route: '/gst/returns' },
    ],
  },
  { name: 'contacts', icon: 'account-group-outline', activeIcon: 'account-group', sidebarGroup: 'manage', pages: [] },
  { name: 'reports', icon: 'chart-box-outline', activeIcon: 'chart-box', sidebarGroup: 'manage', pages: [] },
  { name: 'more', icon: 'dots-horizontal-circle-outline', activeIcon: 'dots-horizontal-circle', sidebarGroup: null, pages: [] },
];

/** Which sections the phone's tab bar shows on each plan, in order. The rest are reached through More. */
export const PHONE_TABS: Record<'full' | 'sales', readonly SectionName[]> = {
  // Five fit a 320dp phone with labels.
  full: ['index', 'sales', 'purchases', 'inventory', 'more'],
  sales: ['index', 'sales', 'gst', 'more'],
};

export const TOOLS: MenuPage[] = [
  { key: 'askLixi', labelKey: 'nav:more.entry.askLixi', icon: 'creation', route: '/lixi' },
  { key: 'search', labelKey: 'nav:more.entry.globalSearch', icon: 'magnify', route: '/search' },
  { key: 'notifications', labelKey: 'nav:title.notifications', icon: 'bell-outline', route: '/notifications', badge: 'unread' },
];

export type SettingsGroupKey = 'businessSetup' | 'gstSetup' | 'data' | 'account';

export const SETTINGS: { key: SettingsGroupKey; labelKey: string; pages: MenuPage[] }[] = [
  {
    key: 'businessSetup',
    labelKey: 'nav:more.group.businessSetup',
    pages: [
      { key: 'company', labelKey: 'nav:more.entry.businessProfile', icon: 'domain', route: '/settings/company' },
      { key: 'branches', labelKey: 'nav:more.entry.branches', icon: 'warehouse', route: '/settings/branches' },
      { key: 'users', labelKey: 'nav:more.entry.usersAndRoles', icon: 'account-multiple-outline', route: '/settings/users' },
      { key: 'taxes', labelKey: 'nav:more.entry.taxes', icon: 'percent-outline', route: '/settings/taxes' },
      { key: 'currencies', labelKey: 'nav:more.entry.currenciesAndRates', icon: 'currency-usd', route: '/settings/currencies' },
      { key: 'numbering', labelKey: 'nav:more.entry.documentNumbering', icon: 'numeric', route: '/settings/numbering' },
      { key: 'accounts', labelKey: 'nav:more.entry.paymentAccounts', icon: 'bank-outline', route: '/settings/accounts' },
      { key: 'expenseCategories', labelKey: 'nav:more.entry.expenseCategories', icon: 'shape-outline', route: '/settings/expense-categories' },
    ],
  },
  {
    key: 'gstSetup',
    labelKey: 'nav:more.group.gstSetup',
    pages: [
      { key: 'gstPortal', labelKey: 'nav:more.entry.gstPortal', icon: 'link-variant', route: '/settings/gst-portal' },
      { key: 'eInvoicing', labelKey: 'nav:more.entry.eInvoicing', icon: 'qrcode', route: '/settings/e-invoicing' },
      { key: 'transporters', labelKey: 'nav:more.entry.transporters', icon: 'truck-outline', route: '/settings/transporters' },
    ],
  },
  {
    key: 'data',
    labelKey: 'nav:more.group.data',
    pages: [
      { key: 'integrations', labelKey: 'nav:more.entry.integrations', icon: 'puzzle-outline', route: '/settings/integrations' },
      { key: 'backup', labelKey: 'nav:more.entry.backupAndExport', icon: 'database-export-outline', route: '/settings/backup' },
      { key: 'audit', labelKey: 'nav:more.entry.auditTrail', icon: 'history', route: '/settings/audit' },
      { key: 'sync', labelKey: 'nav:more.entry.syncStatus', icon: 'sync', route: '/settings/sync', badge: 'offline' },
    ],
  },
  {
    key: 'account',
    labelKey: 'nav:more.group.account',
    pages: [
      { key: 'profile', labelKey: 'nav:title.yourProfile', icon: 'account-circle-outline', route: '/settings/profile' },
      { key: 'devices', labelKey: 'nav:more.entry.devicesAndSessions', icon: 'cellphone-link', route: '/settings/devices' },
      { key: 'notificationSettings', labelKey: 'nav:more.entry.notificationSettings', icon: 'bell-outline', route: '/settings/notifications' },
      { key: 'plan', labelKey: 'nav:more.entry.planAndBilling', icon: 'credit-card-outline', route: '/settings/plan' },
      { key: 'appearance', labelKey: 'nav:more.entry.appearanceAndLanguage', icon: 'theme-light-dark', route: '/settings/appearance' },
      { key: 'about', labelKey: 'nav:more.entry.about', icon: 'information-outline', route: '/settings/about' },
    ],
  },
];

/** The section by name. */
export function section(name: SectionName): MenuSection {
  return MENU.find((s) => s.name === name)!;
}

/** The URL a section's hub lives at. */
export function sectionPath(name: SectionName): string {
  return name === 'index' ? '/' : `/${name}`;
}

/**
 * The expo-router href for a menu route. Everything lives in the `(app)`
 * group; a section's own hub (`/sales`, not `/sales/invoices`) is a tab.
 */
export function appHref(route: string): string {
  if (route === '/') return '/(app)/(tabs)';
  return MENU.some((s) => sectionPath(s.name) === route) ? `/(app)/(tabs)${route}` : `/(app)${route}`;
}
