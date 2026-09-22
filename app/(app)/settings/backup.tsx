import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ListRow } from '@/components/ListRow';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { useAppStore } from '@/store/appStore';
import {
  useActiveCompany,
  useAuditEvents,
  useDocuments,
  useExpenses,
  useItems,
  useParties,
  usePayments,
  useStockMovements,
} from '@/store/selectors';
import { formatDateTime } from '@/lib/date';

export default function BackupExport() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation(['nav', 'settings']);
  const toast = useToast();

  const company = useActiveCompany();
  const parties = useParties();
  const items = useItems();
  const documents = useDocuments();
  const payments = usePayments();
  const expenses = useExpenses();
  const movements = useStockMovements();
  const audit = useAuditEvents();
  const companies = useAppStore((s) => s.companies);

  const [busy, setBusy] = useState(false);
  const [confirmExport, setConfirmExport] = useState(false);
  // Captured once so the render stays pure.
  const [lastBackupAt] = useState(() => new Date(Date.now() - 6 * 3600 * 1000).toISOString());

  const counts = useMemo(
    () => [
      { label: 'Customers & suppliers', value: parties.length, icon: 'account-group-outline' as const },
      { label: 'Items', value: items.length, icon: 'tag-outline' as const },
      { label: 'Documents', value: documents.length, icon: 'file-document-outline' as const },
      { label: 'Payments', value: payments.length, icon: 'cash' as const },
      { label: 'Expenses', value: expenses.length, icon: 'receipt-text-outline' as const },
      { label: 'Stock movements', value: movements.length, icon: 'swap-vertical' as const },
      { label: 'Audit events', value: audit.length, icon: 'history' as const },
    ],
    [parties, items, documents, payments, expenses, movements, audit],
  );

  const buildPackage = () =>
    JSON.stringify(
      {
        format: 'elixir-books-smart/company-export',
        version: 1,
        exportedAt: new Date().toISOString(),
        company,
        parties,
        items,
        documents,
        payments,
        expenses,
        stockMovements: movements,
        auditEvents: audit,
      },
      null,
      2,
    );

  const doExport = async () => {
    setBusy(true);
    try {
      const payload = buildPackage();
      await Share.share({
        message: payload.length > 40000 ? `${payload.slice(0, 40000)}\n… truncated for sharing` : payload,
        title: `${company.name} export`,
      });
      toast.show(tr('settings:backup.prepared'), 'success');
    } catch {
      toast.show(tr('settings:backup.cancelled'), 'error');
    } finally {
      setBusy(false);
      setConfirmExport(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.backupAndExport') }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 140 + insets.bottom }} showsVerticalScrollIndicator={false}>
        <Card style={{ gap: t.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
            <MaterialCommunityIcons name="database-export-outline" size={21} color={t.c.primary} />
            <Text variant="title" weight="700" style={{ flex: 1 }}>
              {company.name}
            </Text>
          </View>
          <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
            The export covers this business only. Your other {companies.length - 1 === 1 ? 'business' : 'businesses'} stay
            out of the package, so you can hand an auditor exactly one set of books.
          </Text>
        </Card>

        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginTop: t.spacing.xl, marginBottom: t.spacing.sm }}>
          What&apos;s included
        </Text>
        <Card padded={false}>
          {counts.map((c, i) => (
            <ListRow
              key={c.label}
              title={c.label}
              icon={c.icon}
              divider={i < counts.length - 1}
              right={
                <Text variant="small" weight="700">
                  {c.value}
                </Text>
              }
            />
          ))}
        </Card>

        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginTop: t.spacing.xl, marginBottom: t.spacing.sm }}>{tr('settings:backup.formats')}</Text>
        <Card padded={false}>
          <ListRow title={tr('settings:backup.json')} subtitle={tr('settings:backup.jsonHint')} icon="code-json" chevron onPress={() => setConfirmExport(true)} />
          <ListRow title={tr('settings:backup.csv')} subtitle={tr('settings:backup.csvHint')} icon="file-delimited-outline" chevron divider={false} />
        </Card>

        <Card variant="flat" style={{ marginTop: t.spacing.lg, gap: t.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
            <MaterialCommunityIcons name="cloud-check-outline" size={19} color={t.c.good} />
            <Text variant="small" weight="600">{tr('settings:backup.automatic')}</Text>
            <Badge label={tr('settings:backup.nightly')} tone="success" size="sm" />
          </View>
          <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
            Last backup {formatDateTime(lastBackupAt)}. Financial records subject to
            statutory retention are kept even if you remove them from this device.
          </Text>
        </Card>
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: t.spacing.lg,
          paddingBottom: insets.bottom + t.spacing.md,
          borderTopWidth: 1,
          borderTopColor: t.c.line,
          backgroundColor: t.c.paper,
        }}
      >
        <Button title={tr('settings:backup.export')} icon="database-export-outline" onPress={() => setConfirmExport(true)} loading={busy} fullWidth size="lg" />
      </View>

      <ConfirmDialog
        visible={confirmExport}
        title={tr('settings:backup.exportTitle')}
        message={tr('settings:backup.exportMessage')}
        confirmLabel={tr('settings:backup.exportConfirm')}
        icon="database-export-outline"
        onCancel={() => setConfirmExport(false)}
        onConfirm={doExport}
      />
    </View>
  );
}
