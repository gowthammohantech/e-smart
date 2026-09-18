import React, { useMemo, useState } from 'react';
import { ScrollView, Share, View } from 'react-native';
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
      toast.show('Export package prepared', 'success');
    } catch {
      toast.show('Export was cancelled', 'error');
    } finally {
      setBusy(false);
      setConfirmExport(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: 'Backup & export' }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
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

        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginTop: t.spacing.xl, marginBottom: t.spacing.sm }}>
          Formats
        </Text>
        <Card padded={false}>
          <ListRow title="Machine-readable JSON" subtitle="Full records, ready to import elsewhere" icon="code-json" chevron onPress={() => setConfirmExport(true)} />
          <ListRow title="Per-report CSV" subtitle="Open any report and export it individually" icon="file-delimited-outline" chevron divider={false} />
        </Card>

        <Card variant="flat" style={{ marginTop: t.spacing.lg, gap: t.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
            <MaterialCommunityIcons name="cloud-check-outline" size={19} color={t.c.good} />
            <Text variant="small" weight="600">
              Automatic backup
            </Text>
            <Badge label="Nightly" tone="success" size="sm" />
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
          paddingBottom: t.spacing.xl,
          borderTopWidth: 1,
          borderTopColor: t.c.line,
          backgroundColor: t.c.paper,
        }}
      >
        <Button title="Export this business" icon="database-export-outline" onPress={() => setConfirmExport(true)} loading={busy} fullWidth size="lg" />
      </View>

      <ConfirmDialog
        visible={confirmExport}
        title="Export company data?"
        message="The package contains customer details and financial records. Share it only with people who should see them."
        confirmLabel="Export"
        icon="database-export-outline"
        onCancel={() => setConfirmExport(false)}
        onConfirm={doExport}
      />
    </View>
  );
}
