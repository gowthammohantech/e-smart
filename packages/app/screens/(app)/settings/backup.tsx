import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, ScrollView, View } from 'react-native';
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
import { useActiveCompany } from '../../../store/selectors';
import { useCompanyUsage } from '../../../remote/queries';
import { formatDateTime } from '@esmart/core/lib/date';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { Skeleton, SkeletonGroup } from '@esmart/ui/components/Skeleton';
import { Button } from '@esmart/ui/components/Button';

export default function BackupExport() {
  // Keyed by business: on the web the page stays open across a switch, and what it copied or fetched
  // at mount belongs to the business it opened on.
  const companyId = useAppStore((s) => s.activeCompanyId);
  return <BackupExportBody key={companyId} />;
}

function BackupExportBody() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation(['nav', 'settings', 'auth', 'reports']);
  const toast = useToast();

  const company = useActiveCompany();
  const usageQuery = useCompanyUsage();
  const usage = usageQuery.data;
  const companies = useAppStore((s) => s.companies);

  const [busy, setBusy] = useState(false);
  const [confirmExport, setConfirmExport] = useState<ExportFormat | null>(null);
  // What the server holds; null until it answers (or when it can't be reached).
  const [backup, setBackup] = useState<BackupSettings | null>(null);
  const [backupFailed, setBackupFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    getBackupSettings(company.id)
      .then((b) => live && setBackup(b))
      .catch(() => {
        if (!live) return;
        setBackup(null);
        setBackupFailed(true);
      });
    return () => {
      live = false;
    };
  }, [company.id, attempt]);

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
      { label: tr('settings:backup.count.parties'), value: usage?.counts.parties, icon: 'account-group-outline' as const },
      { label: tr('settings:backup.count.items'), value: usage?.counts.items, icon: 'tag-outline' as const },
      { label: tr('settings:backup.count.documents'), value: usage?.counts.documents, icon: 'file-document-outline' as const },
      { label: tr('settings:backup.count.payments'), value: usage?.counts.payments, icon: 'cash' as const },
      { label: tr('nav:title.expenses'), value: usage?.counts.expenses, icon: 'receipt-text-outline' as const },
      { label: tr('nav:title.stockMovements'), value: usage?.counts.stockMovements, icon: 'swap-vertical' as const },
      { label: tr('settings:backup.count.auditEvents'), value: usage?.counts.auditEvents, icon: 'history' as const },
    ],
    [usage, tr],
  );

  /** The server builds the package (every record of this business) and hands back a signed download link. */
  const doExport = async (format: ExportFormat) => {
    setConfirmExport(null);
    setBusy(true);
    // A browser only opens a new tab straight from the tap; one opened after the server answers is
    // blocked as a popup. So the tab opens now and is pointed at the download once it is ready.
    const win = Platform.OS === 'web' ? (globalThis as unknown as { open?: (u: string, t: string) => { location: { href: string }; close: () => void } | null }).open?.('', '_blank') ?? null : null;
    try {
      const url = await toast.promise(exportCompany(company.id, format), {
        loading: tr('settings:backup.preparing'),
        success: { text: tr('settings:backup.prepared'), detail: `${company.name} · ${format.toUpperCase()}` },
        error: (err) => describeError(err, tr),
        icon: 'database-export-outline',
      });
      if (win) win.location.href = url;
      else await Linking.openURL(url);
    } catch {
      // The toast has said what went wrong.
      win?.close();
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
                // Not yet known: a placeholder, not a 0.
                c.value === undefined ? (
                  usageQuery.isError ? (
                    <Text variant="small" tone="muted">
                      —
                    </Text>
                  ) : (
                    <SkeletonGroup>
                      <Skeleton height={14} width={32} />
                    </SkeletonGroup>
                  )
                ) : (
                  <Text variant="small" weight="700">
                    {c.value}
                  </Text>
                )
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
            <Icon name={backup?.automatic ? 'cloud-check-outline' : 'cloud-outline'} size={19} color={backup?.automatic ? t.c.good : t.c.muted} />
            <Text variant="small" weight="600" style={{ flex: 1 }}>{tr('settings:backup.automatic')}</Text>
            {backup?.automatic ? <Badge label={backup.frequency === 'weekly' ? tr('settings:backup.weekly') : tr('settings:backup.nightly')} tone="success" size="sm" /> : null}
          </View>
          {backup ? (
            <SwitchField label={tr('settings:backup.automaticSwitch')} value={!!backup.automatic} onValueChange={toggleAutomatic} />
          ) : backupFailed ? (
            // The setting couldn't be read: say so, with a retry, rather than dropping the switch.
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
              <Text variant="caption" tone="bad" style={{ flex: 1 }}>
                {tr('reports:dash.state.failedTitle')}
              </Text>
              <Button title={tr('reports:dash.state.retry')} variant="ghost" size="sm" onPress={() => {
                  setBackupFailed(false);
                  setAttempt((n) => n + 1);
                }}
              />
            </View>
          ) : (
            <SkeletonGroup>
              <Skeleton height={28} width="100%" />
            </SkeletonGroup>
          )}
          {backup === null && !backupFailed ? (
            // Not read yet: a placeholder rather than "No backup yet".
            <SkeletonGroup style={{ gap: 6 }}>
              <Skeleton height={12} width="70%" radius={4} />
              <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
                {tr('settings:backup.retentionNote')}
              </Text>
            </SkeletonGroup>
          ) : (
            <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
              {backup?.lastBackupAt ? tr('settings:backup.lastBackup', { when: formatDateTime(backup.lastBackupAt) }) : tr('settings:backup.noBackupYet')}{' '}
              {tr('settings:backup.retentionNote')}
            </Text>
          )}
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
