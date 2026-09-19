import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { AppHeader } from '@/components/AppHeader';
import { SectionHeader } from '@/components/Screen';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { Avatar } from '@/components/Avatar';
import { ListRow } from '@/components/ListRow';
import { Badge } from '@/components/Badge';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { useAppStore } from '@/store/appStore';
import {
  useActiveCompany,
  useComplianceSummary,
  useCanOpen,
  useCurrentUser,
  useModuleSet,
  useUnreadCount,
} from '@/store/selectors';
import { useUiStore } from '@/store/uiStore';

type Entry = {
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  route: string;
  badge?: string;
};

export default function MoreTab() {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'nav']);
  const router = useRouter();
  const toast = useToast();

  const user = useCurrentUser();
  const company = useActiveCompany();
  const unread = useUnreadCount();
  const signOut = useAppStore((s) => s.signOut);
  const resetDemoData = useAppStore((s) => s.resetDemoData);
  const offline = useUiStore((s) => s.offlineMode);
  const complianceSummary = useComplianceSummary();
  const canOpen = useCanOpen();
  const moduleSet = useModuleSet();

  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const allGroups: { title: string; entries: Entry[] }[] = [
    // The Sales plan has no People or Reports tab, so they live here.
    ...(moduleSet === 'sales'
      ? [
          {
            title: tr('nav:more.group.sales'),
            entries: [
              { label: tr('nav:more.entry.customers'), icon: 'account-group-outline', route: '/(app)/(tabs)/contacts' },
              { label: tr('nav:more.entry.itemsAndServices'), icon: 'package-variant', route: '/(app)/catalog/items' },
              { label: tr('nav:more.entry.reports'), icon: 'chart-box-outline', route: '/(app)/(tabs)/reports' },
            ] as Entry[],
          },
        ]
      : []),
    {
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
      title: tr('nav:more.group.tools'),
      entries: [
        { label: tr('nav:more.entry.scanBill'), icon: 'text-recognition', route: '/(app)/ocr/capture' },
        { label: tr('nav:more.entry.askLixi'), icon: 'creation', route: '/(app)/lixi' },
        { label: tr('nav:more.entry.globalSearch'), icon: 'magnify', route: '/(app)/search' },
        { label: tr('nav:more.entry.notifications'), icon: 'bell-outline', route: '/(app)/notifications', badge: unread ? String(unread) : undefined },
      ],
    },
    {
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

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <AppHeader title={tr('nav:more.header.title')} subtitle={tr('nav:more.header.subtitle')} />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Card
          onPress={() => router.push('/(app)/settings/profile')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}
        >
          <Avatar name={user?.name ?? 'You'} size={50} color={user?.avatarColor} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text variant="title">{user?.name}</Text>
            <Text variant="caption" tone="muted">
              {user?.email}
            </Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 3 }}>
              <Badge label={user?.role ?? 'owner'} tone="info" size="sm" />
              <Badge label={company?.name ?? ''} tone="neutral" size="sm" />
            </View>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={18} color={t.c.muted} />
        </Card>

        {groups.map((g) => (
          <View key={g.title}>
            <SectionHeader title={g.title} />
            <Card padded={false}>
              {g.entries.map((e, i) => (
                <ListRow
                  key={e.label}
                  title={e.label}
                  icon={e.icon}
                  chevron
                  divider={i < g.entries.length - 1}
                  onPress={() => router.push(e.route as never)}
                  right={e.badge ? <Badge label={e.badge} tone="danger" size="sm" /> : undefined}
                />
              ))}
            </Card>
          </View>
        ))}

        <SectionHeader title={tr('nav:more.group.prototype')} />
        <Card padded={false}>
          <ListRow
            title={tr('nav:more.reset.row')}
            subtitle={tr('nav:more.reset.rowSubtitle')}
            icon="restore"
            iconColor={t.c.warn}
            onPress={() => setConfirmReset(true)}
          />
          <ListRow
            title={tr('nav:more.signOut.row')}
            icon="logout"
            iconColor={t.c.bad}
            destructive
            divider={false}
            onPress={() => setConfirmSignOut(true)}
          />
        </Card>

        <Text variant="micro" tone="muted" center style={{ marginTop: t.spacing.xl }}>
          {tr('nav:more.build', { version: '1.0.0' })}
        </Text>
      </ScrollView>

      <ConfirmDialog
        visible={confirmReset}
        title={tr('nav:more.reset.title')}
        message={tr('nav:more.reset.message')}
        confirmLabel={tr('nav:more.reset.confirm')}
        destructive
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          resetDemoData();
          setConfirmReset(false);
          toast.show(tr('nav:more.reset.done'), 'success');
        }}
      />

      <ConfirmDialog
        visible={confirmSignOut}
        title={tr('nav:more.signOut.title')}
        message={tr('nav:more.signOut.message')}
        confirmLabel={tr('nav:more.signOut.confirm')}
        destructive
        icon="logout"
        onCancel={() => setConfirmSignOut(false)}
        onConfirm={() => {
          setConfirmSignOut(false);
          signOut();
          router.replace('/(auth)/welcome');
        }}
      />
    </View>
  );
}
