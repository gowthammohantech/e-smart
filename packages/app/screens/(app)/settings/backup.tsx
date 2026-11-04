import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Icon } from '@esmart/ui/components/Icon';
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
import { useActiveCompany, useAuditEvents } from '../../../store/selectors';
import { useCompanyUsage } from '../../../remote/queries';
import { formatDateTime } from '@esmart/core/lib/date';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';

export default function BackupExport() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation(['nav', 'settings', 'auth']);
  const toast = useToast();

  const company = useActiveCompany();
  const usage = useCompanyUsage().data;
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
        toast.show(describeError(err, tr), 'error', { icon: 'cloud-off-outline' });
      });
  };

  // What the server holds, which is what the export contains.
  const counts = useMemo(
    () => [
      { label: tr('settings:backup.count.parties'), value: usage?.counts.parties ?? 0, icon: 'account-group-outline' as const },
      { label: tr('settings:backup.count.items'), value: usage?.counts.items ?? 0, icon: 'tag-outline' as const },
      { label: tr('settings:backup.count.documents'), value: usage?.counts.documents ?? 0, icon: 'file-document-outline' as const },
      { label: tr('settings:backup.count.payments'), value: usage?.counts.payments ?? 0, icon: 'cash' as const },
      { label: tr('nav:title.expenses'), value: usage?.counts.expenses ?? 0, icon: 'receipt-text-outline' as const },
      { label: tr('nav:title.stockMovements'), value: usage?.counts.stockMovements ?? 0, icon: 'swap-vertical' as const },
      { label: tr('settings:backup.count.auditEvents'), value: audit.length, icon: 'history' as const },
    ],
    [usage, audit, tr],
  );

  /** The server builds the package (every record of this business) and hands back a signed download link. */
  const doExport = async (format: ExportFormat) => {
    setConfirmExport(null);
    setBusy(true);
    try {
      const url = await toast.promise(exportCompany(company.id, format), {
        loading: tr('settings:backup.preparing'),
        success: { text: tr('settings:backup.prepared'), detail: `${company.name} · ${format.toUpperCase()}` },
        error: (err) => describeError(err, tr),
        icon: 'database-export-outline',
      });
      await Linking.openURL(url);
    } catch {
      // The toast has said what went wrong.
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.backupAndExport') }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 140 + insets.bottom }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Card style={{ gap: t.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
            <Icon name="database-export-outline" size={21} color={t.c.primary} />
            <Text variant="title" weight="700" style={{ flex: 1 }}>
              {company.name}
            </Text>
          </View>
          <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
            {tr('settings:backup.scopeNote', { count: companies.length - 1 })}
          </Text>
        </Card>

        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginTop: t.spacing.xl, marginBottom: t.spacing.sm }}>
          {tr('settings:backup.included')}
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
            <Icon name="cloud-check-outline" size={19} color={t.c.good} />
            <Text variant="small" weight="600" style={{ flex: 1 }}>{tr('settings:backup.automatic')}</Text>
            {backup?.automatic ? <Badge label={backup.frequency === 'weekly' ? tr('settings:backup.weekly') : tr('settings:backup.nightly')} tone="success" size="sm" /> : null}
          </View>
          {backup ? <SwitchField label={tr('settings:backup.automaticSwitch')} value={!!backup.automatic} onValueChange={toggleAutomatic} /> : null}
          <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
            {backup?.lastBackupAt ? tr('settings:backup.lastBackup', { when: formatDateTime(backup.lastBackupAt) }) : tr('settings:backup.noBackupYet')}{' '}
            {tr('settings:backup.retentionNote')}
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
