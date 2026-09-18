import React, { useState } from 'react';
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
  useCurrentUser,
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
  const router = useRouter();
  const toast = useToast();

  const user = useCurrentUser();
  const company = useActiveCompany();
  const unread = useUnreadCount();
  const signOut = useAppStore((s) => s.signOut);
  const resetDemoData = useAppStore((s) => s.resetDemoData);
  const offline = useUiStore((s) => s.offlineMode);
  const complianceSummary = useComplianceSummary();

  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const groups: { title: string; entries: Entry[] }[] = [
    {
      title: 'Money',
      entries: [
        { label: 'Receivables', icon: 'clock-alert-outline', route: '/(app)/receivables' },
        { label: 'Payables', icon: 'file-clock-outline', route: '/(app)/payables' },
        { label: 'Payments received', icon: 'cash-plus', route: '/(app)/payments/received' },
        { label: 'Payments made', icon: 'cash-minus', route: '/(app)/payments/made' },
        { label: 'Expenses', icon: 'receipt-text-outline', route: '/(app)/expenses' },
      ],
    },
    {
      title: 'Tools',
      entries: [
        { label: 'Scan a bill or receipt', icon: 'text-recognition', route: '/(app)/ocr/capture' },
        { label: 'Ask the assistant', icon: 'robot-outline', route: '/(app)/assistant' },
        { label: 'Global search', icon: 'magnify', route: '/(app)/search' },
        { label: 'Notifications', icon: 'bell-outline', route: '/(app)/notifications', badge: unread ? String(unread) : undefined },
      ],
    },
    {
      title: 'Business setup',
      entries: [
        { label: 'Business profile', icon: 'domain', route: '/(app)/settings/company' },
        { label: 'Branches', icon: 'warehouse', route: '/(app)/settings/branches' },
        { label: 'Users & roles', icon: 'account-multiple-outline', route: '/(app)/settings/users' },
        { label: 'Taxes', icon: 'percent-outline', route: '/(app)/settings/taxes' },
        { label: 'Currencies & rates', icon: 'currency-usd', route: '/(app)/settings/currencies' },
        { label: 'Document numbering', icon: 'numeric', route: '/(app)/settings/numbering' },
        { label: 'Payment accounts', icon: 'bank-outline', route: '/(app)/settings/accounts' },
        { label: 'Expense categories', icon: 'shape-outline', route: '/(app)/settings/expense-categories' },
      ],
    },
    {
      title: 'Data & compliance',
      entries: [
        {
          label: 'GST compliance',
          icon: 'shield-check-outline',
          route: '/(app)/compliance',
          badge: complianceSummary.eInvoice.failed
            ? String(complianceSummary.eInvoice.failed)
            : undefined,
        },
        { label: 'E-invoicing & e-way bill', icon: 'qrcode', route: '/(app)/settings/e-invoicing' },
        { label: 'Integrations', icon: 'puzzle-outline', route: '/(app)/settings/integrations' },
        { label: 'Backup & export', icon: 'database-export-outline', route: '/(app)/settings/backup' },
        { label: 'Audit trail', icon: 'history', route: '/(app)/settings/audit' },
        { label: 'Sync status', icon: 'sync', route: '/(app)/settings/sync', badge: offline ? 'Offline' : undefined },
      ],
    },
    {
      title: 'Account',
      entries: [
        { label: 'Devices & sessions', icon: 'cellphone-link', route: '/(app)/settings/devices' },
        { label: 'Plan & billing', icon: 'credit-card-outline', route: '/(app)/settings/plan' },
        { label: 'Appearance', icon: 'theme-light-dark', route: '/(app)/settings/appearance' },
        { label: 'About', icon: 'information-outline', route: '/(app)/settings/about' },
      ],
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <AppHeader title="More" subtitle="Settings and tools" />

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

        <SectionHeader title="Prototype" />
        <Card padded={false}>
          <ListRow
            title="Reset demo data"
            subtitle="Restore the sample business to its original state"
            icon="restore"
            iconColor={t.c.warn}
            onPress={() => setConfirmReset(true)}
          />
          <ListRow
            title="Sign out"
            icon="logout"
            iconColor={t.c.bad}
            destructive
            divider={false}
            onPress={() => setConfirmSignOut(true)}
          />
        </Card>

        <Text variant="micro" tone="muted" center style={{ marginTop: t.spacing.xl }}>
          Elixir Books Smart · prototype build 1.0.0
        </Text>
      </ScrollView>

      <ConfirmDialog
        visible={confirmReset}
        title="Reset demo data?"
        message="Everything you've created in this prototype will be replaced with the original sample business. This cannot be undone."
        confirmLabel="Reset"
        destructive
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          resetDemoData();
          setConfirmReset(false);
          toast.show('Demo data restored', 'success');
        }}
      />

      <ConfirmDialog
        visible={confirmSignOut}
        title="Sign out?"
        message="You can sign back in with the same demo credentials at any time."
        confirmLabel="Sign out"
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
