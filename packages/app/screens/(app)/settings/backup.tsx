import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { PrimaryActionBar } from '@esmart/ui/components/ActionBar';
import { ListRow } from '@esmart/ui/components/ListRow';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { useToast } from '@esmart/ui/components/Toast';
import { SwitchField } from '@esmart/ui/components/Field';
import { exportCompany, getBackupSettings, saveBackupSettings, type BackupSettings, type ExportFormat } from '../../../remote/exports';
import { describeError } from '../../../remote/errors';
import { useAppStore } from '../../../store/appStore';
import {
  useActiveCompany,
  useAuditEvents,
  useDocuments,
  useExpenses,
  useItems,
  useParties,
  usePayments,
  useStockMovements,
} from '../../../store/selectors';
import { formatDateTime } from '@esmart/core/lib/date';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';

export default function BackupExport() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation(['nav', 'settings', 'auth']);
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
  const [confirmExport, setConfirmExport] = useState<ExportFormat | null>(null);
  // What the server holds; null until it answers (or when it can't be reached).
  const [backup, setBackup] = useState<BackupSettings | null>(null);

  useEffect(() => {
    let live = true;
    getBackupSettings(company.id)
      .then((b) => live && setBackup(b))
      .catch(() => live && setBackup(null));
    return () => {
      live = false;
    };
  }, [company.id]);

  const toggleAutomatic = (automatic: boolean) => {
    const next = { ...(backup ?? {}), automatic };
    setBackup(next);
    saveBackupSettings(company.id, next)
      .then(setBackup)
      .catch((err: unknown) => {
        setBackup(backup);
        toast.show(describeError(err, tr), 'error');
      });
  };

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

  /** The server builds the package (every record of this business) and hands back a signed download link. */
  const doExport = async (format: ExportFormat) => {
    setConfirmExport(null);
    setBusy(true);
    try {
      const url = await exportCompany(company.id, format);
      await Linking.openURL(url);
      toast.show(tr('settings:backup.prepared'), 'success');
    } catch (err) {
      toast.show(describeError(err, tr), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.backupAndExport') }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 140 + insets.bottom }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
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
          <ListRow title={tr('settings:backup.json')} subtitle={tr('settings:backup.jsonHint')} icon="code-json" chevron onPress={() => setConfirmExport('json-backup')} />
          <ListRow title={tr('settings:backup.csv')} subtitle={tr('settings:backup.csvHint')} icon="file-delimited-outline" chevron onPress={() => setConfirmExport('csv-zip')} />
          <ListRow title={tr('settings:backup.tally')} subtitle={tr('settings:backup.tallyHint')} icon="file-code-outline" chevron divider={false} onPress={() => setConfirmExport('tally-xml')} />
        </Card>

        <Card variant="flat" style={{ marginTop: t.spacing.lg, gap: t.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
            <MaterialCommunityIcons name="cloud-check-outline" size={19} color={t.c.good} />
            <Text variant="small" weight="600" style={{ flex: 1 }}>{tr('settings:backup.automatic')}</Text>
            {backup?.automatic ? <Badge label={backup.frequency === 'weekly' ? tr('settings:backup.weekly') : tr('settings:backup.nightly')} tone="success" size="sm" /> : null}
          </View>
          {backup ? <SwitchField label={tr('settings:backup.automaticSwitch')} value={!!backup.automatic} onValueChange={toggleAutomatic} /> : null}
          <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
            {backup?.lastBackupAt ? tr('settings:backup.lastBackup', { when: formatDateTime(backup.lastBackupAt) }) : tr('settings:backup.noBackupYet')}{' '}
            Financial records subject to statutory retention are kept even if you remove them from this device.
          </Text>
        </Card>
      </ScrollView>

      <PrimaryActionBar title={tr('settings:backup.export')} icon="database-export-outline" onPress={() => setConfirmExport('json-backup')} loading={busy} />

      <ConfirmDialog
        visible={confirmExport !== null}
        title={tr('settings:backup.exportTitle')}
        message={tr('settings:backup.exportMessage')}
        confirmLabel={tr('settings:backup.exportConfirm')}
        icon="database-export-outline"
        onCancel={() => setConfirmExport(null)}
        onConfirm={() => confirmExport && void doExport(confirmExport)}
      />
    </View>
  );
}
