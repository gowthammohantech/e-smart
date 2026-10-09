import { useTranslation } from 'react-i18next';
import type { MaterialCommunityIcons } from '@expo/vector-icons';
import { countLabel } from '@esmart/core/lib/format';
import { useCanOpen, useComplianceSummary, useModuleSet, useUnreadCount } from '../store/selectors';
import { useUiStore } from '../store/uiStore';

export type MoreEntry = {
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  route: string;
  badge?: string;
};

export type MoreGroupKey = 'sales' | 'business' | 'money' | 'tools' | 'businessSetup' | 'dataCompliance' | 'account';

export type MoreGroup = { key: MoreGroupKey; title: string; entries: MoreEntry[] };

/**
 * Everything the More tab lists, grouped, minus what the plan can't open.
 * The desktop web app builds its settings navigation from the same groups.
 */
export function useMoreGroups(): MoreGroup[] {
  const { t: tr } = useTranslation(['common', 'nav']);
  const unread = useUnreadCount();
  const offline = useUiStore((s) => s.offlineMode);
  const complianceSummary = useComplianceSummary();
  const canOpen = useCanOpen();
  const moduleSet = useModuleSet();

  const allGroups: MoreGroup[] = [
    // The Sales plan has no People or Reports tab, so they live here.
    ...(moduleSet === 'sales'
      ? [
          {
            key: 'sales' as const,
            title: tr('nav:more.group.sales'),
            entries: [
              { label: tr('nav:more.entry.customers'), icon: 'account-group-outline', route: '/(app)/(tabs)/contacts' },
              { label: tr('nav:more.entry.itemsAndServices'), icon: 'package-variant', route: '/(app)/catalog/items' },
              { label: tr('nav:more.entry.reports'), icon: 'chart-box-outline', route: '/(app)/(tabs)/reports' },
            ] as MoreEntry[],
          },
        ]
      : [
          // Five tabs fit a small phone; People and Reports move here on the full plan.
          {
            key: 'business' as const,
            title: tr('nav:more.group.business'),
            entries: [
              { label: tr('nav:tab.contacts'), icon: 'account-group-outline', route: '/(app)/(tabs)/contacts' },
              { label: tr('nav:tab.reports'), icon: 'chart-box-outline', route: '/(app)/(tabs)/reports' },
            ] as MoreEntry[],
          },
        ]),
    {
      key: 'money' as const,
      title: tr('nav:more.group.money'),
      entries: [
        { label: tr('nav:more.entry.receivables'), icon: 'clock-alert-outline', route: '/(app)/receivables' },
        { label: tr('nav:more.entry.payables'), icon: 'file-clock-outline', route: '/(app)/payables' },
        { label: tr('nav:more.entry.paymentsReceived'), icon: 'cash-plus', route: '/(app)/payments/received' },
        { label: tr('nav:more.entry.paymentsMade'), icon: 'cash-minus', route: '/(app)/payments/made' },
        { label: tr('nav:more.entry.expenses'), icon: 'receipt-text-outline', route: '/(app)/expenses' },
      ],
    },
    {
      key: 'tools' as const,
      title: tr('nav:more.group.tools'),
      entries: [
        { label: tr('nav:more.entry.scanBill'), icon: 'text-recognition', route: '/(app)/ocr/capture' },
        { label: tr('nav:more.entry.askLixi'), icon: 'creation', route: '/(app)/lixi' },
        { label: tr('nav:more.entry.globalSearch'), icon: 'magnify', route: '/(app)/search' },
        { label: tr('nav:more.entry.notifications'), icon: 'bell-outline', route: '/(app)/notifications', badge: unread ? countLabel(unread) : undefined },
      ],
    },
    {
      key: 'businessSetup' as const,
      title: tr('nav:more.group.businessSetup'),
      entries: [
        { label: tr('nav:more.entry.businessProfile'), icon: 'domain', route: '/(app)/settings/company' },
        { label: tr('nav:more.entry.branches'), icon: 'warehouse', route: '/(app)/settings/branches' },
        { label: tr('nav:more.entry.usersAndRoles'), icon: 'account-multiple-outline', route: '/(app)/settings/users' },
        { label: tr('nav:more.entry.taxes'), icon: 'percent-outline', route: '/(app)/settings/taxes' },
        { label: tr('nav:more.entry.currenciesAndRates'), icon: 'currency-usd', route: '/(app)/settings/currencies' },
        { label: tr('nav:more.entry.documentNumbering'), icon: 'numeric', route: '/(app)/settings/numbering' },
        { label: tr('nav:more.entry.paymentAccounts'), icon: 'bank-outline', route: '/(app)/settings/accounts' },
        { label: tr('nav:more.entry.expenseCategories'), icon: 'shape-outline', route: '/(app)/settings/expense-categories' },
      ],
    },
    {
      key: 'dataCompliance' as const,
      title: tr('nav:more.group.dataCompliance'),
      entries: [
        {
          label: tr('nav:more.entry.gstCompliance'),
          icon: 'shield-check-outline',
          route: '/(app)/compliance',
          badge: complianceSummary.eInvoice.failed
            ? String(complianceSummary.eInvoice.failed)
            : undefined,
        },
        { label: tr('nav:more.entry.gstr1'), icon: 'file-send-outline', route: '/(app)/gst/gstr1' },
        { label: tr('nav:more.entry.eInvoicing'), icon: 'qrcode', route: '/(app)/settings/e-invoicing' },
        { label: tr('nav:more.entry.transporters'), icon: 'truck-outline', route: '/(app)/settings/transporters' },
        { label: tr('nav:more.entry.integrations'), icon: 'puzzle-outline', route: '/(app)/settings/integrations' },
        { label: tr('nav:more.entry.backupAndExport'), icon: 'database-export-outline', route: '/(app)/settings/backup' },
        { label: tr('nav:more.entry.auditTrail'), icon: 'history', route: '/(app)/settings/audit' },
        { label: tr('nav:more.entry.syncStatus'), icon: 'sync', route: '/(app)/settings/sync', badge: offline ? tr('common:component.offline') : undefined },
      ],
    },
    {
      key: 'account' as const,
      title: tr('nav:more.group.account'),
      entries: [
        { label: tr('nav:more.entry.devicesAndSessions'), icon: 'cellphone-link', route: '/(app)/settings/devices' },
        { label: tr('nav:more.entry.planAndBilling'), icon: 'credit-card-outline', route: '/(app)/settings/plan' },
        { label: tr('nav:more.entry.appearanceAndLanguage'), icon: 'theme-light-dark', route: '/(app)/settings/appearance' },
        { label: tr('nav:more.entry.about'), icon: 'information-outline', route: '/(app)/settings/about' },
      ],
    },
  ];
  const groups = allGroups
    .map((g) => ({ ...g, entries: g.entries.filter((e) => canOpen(e.route)) }))
    .filter((g) => g.entries.length > 0);
  return groups;
}
