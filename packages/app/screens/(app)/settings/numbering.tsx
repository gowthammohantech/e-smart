import { useTranslation } from 'react-i18next';
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Cell, DataTable } from '@esmart/ui/components/DataTable';
import { Sheet } from '@esmart/ui/components/Sheet';
import { PickerField, SwitchField, TextField } from '@esmart/ui/components/Field';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { NumberingSeries } from '@esmart/core/types';
import { formatNumber } from '@esmart/core/domain/numbering';
import { seriesLabel } from '@esmart/core/labels';
import { useAppStore } from '../../../store/appStore';
import { useBranches, useComplianceSettings, useNumberingSeries } from '../../../store/selectors';
import { today, financialYearOf } from '@esmart/core/lib/date';
import { E_INVOICE_DOC_NUMBER_MAX, sanitizePrefix } from '@esmart/core/lib/validators';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { useSaveShortcut } from '../../../components/useSaveShortcut';
import { useServerSave } from '../../../components/useServerSave';

const RESET_LABELS = {
  never: 'settings:numbering.reset.never',
  yearly: 'settings:numbering.reset.yearly',
  monthly: 'settings:numbering.reset.monthly',
} as const satisfies Record<NumberingSeries['resetPolicy'], string>;

export default function NumberingSettings() {
  const t = useTheme();
  const { t: tr } = useTranslation(['domain', 'nav', 'settings', 'common']);
  const { run: serverSave, saving } = useServerSave();

  const series = useNumberingSeries();
  const branches = useBranches();
  const saveNumberingSeries = useAppStore((s) => s.saveNumberingSeries);
  const activeBranchId = useAppStore((s) => s.activeBranchId);

  const [editing, setEditing] = useState<NumberingSeries | null>(null);
  const [prefix, setPrefix] = useState('');
  const [nextNumber, setNextNumber] = useState('');
  const [padding, setPadding] = useState('4');
  const [includeFy, setIncludeFy] = useState(true);
  const [includeBranch, setIncludeBranch] = useState(false);
  const [resetPolicy, setResetPolicy] = useState<NumberingSeries['resetPolicy']>('yearly');
  const [resetOpen, setResetOpen] = useState(false);

  const branchCode = branches.find((b) => b.id === activeBranchId)?.code;

  const open = (s: NumberingSeries) => {
    setEditing(s);
    setPrefix(s.prefix);
    setNextNumber(String(s.nextNumber));
    setPadding(String(s.padding));
    setIncludeFy(s.includeFiscalYear);
    setIncludeBranch(s.includeBranchCode);
    setResetPolicy(s.resetPolicy);
  };

  const draft: NumberingSeries | null = editing
    ? {
        ...editing,
        prefix: prefix.replace(/\/+$/, '') || editing.prefix,
        nextNumber: Number(nextNumber) || 1,
        padding: Number(padding) || 4,
        includeFiscalYear: includeFy,
        includeBranchCode: includeBranch,
        resetPolicy,
      }
    : null;

  // Back below a number already issued, on the same prefix, would hand out that number twice.
  const belowIssued = !!editing && !!draft && draft.prefix === editing.prefix && draft.nextNumber < editing.nextNumber;
  const numberError = belowIssued ? tr('settings:numbering.belowIssued', { number: editing!.nextNumber }) : undefined;
  // The IRP takes document numbers of up to 16 characters: with e-invoicing on, longer can't be saved.
  const eInvoicing = !!useComplianceSettings().eInvoiceEnabled;
  const tooLong = !!draft && formatNumber(draft, { date: today(), branchCode }).length > E_INVOICE_DOC_NUMBER_MAX;
  const prefixError = tooLong && eInvoicing ? tr('settings:numbering.tooLongForEInvoice', { count: E_INVOICE_DOC_NUMBER_MAX }) : undefined;

  const save = async () => {
    if (!draft || numberError || prefixError) return;
    // The sheet stays open until the server has it, so a refusal can be fixed here.
    const res = await serverSave(
      () => saveNumberingSeries(draft),
      tr('settings:numbering.updated', { series: seriesLabel(tr, draft.kind) }),
      { icon: 'pound', detail: `${draft.prefix}${draft.nextNumber}` },
    );
    if (res) setEditing(null);
  };

  // Ctrl+S (⌘+S) does what Save does, while the form is open.
  useSaveShortcut(save, !!editing);
  const desktop = useIsDesktop();

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.documentNumbering') }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Card variant="flat" style={{ marginBottom: t.spacing.lg }}>
          <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
            {tr('settings:numbering.intro')}
          </Text>
        </Card>

        {desktop ? (
          // A table across the page; a row opens the same editor the phone's row does.
          <DataTable
            columns={[
              { key: 'type', header: tr('common:table.type'), flex: 2, render: (s) => <Cell weight="600">{seriesLabel(tr, s.kind)}</Cell>, sortValue: (s) => seriesLabel(tr, s.kind) },
              { key: 'prefix', header: tr('settings:numbering.prefix'), flex: 1, render: (s) => <Cell mono>{s.prefix || '—'}</Cell> },
              { key: 'next', header: tr('settings:numbering.nextNumber'), flex: 2, render: (s) => <Cell mono>{formatNumber(s, { date: today(), branchCode })}</Cell> },
              { key: 'reset', header: tr('settings:numbering.resetPolicy'), flex: 2, render: (s) => <Cell tone="muted">{tr(RESET_LABELS[s.resetPolicy])}</Cell> },
            ]}
            rows={series}
            rowKey={(s) => s.id}
            onRowPress={open}
            rowLabel={(s) => `${seriesLabel(tr, s.kind)}, ${formatNumber(s, { date: today(), branchCode })}`}
            scroll={false}
          />
        ) : (
        <Card padded={false}>
          {series.map((s, i) => (
            <ListRow
              key={s.id}
              title={seriesLabel(tr, s.kind)}
              subtitle={formatNumber(s, { date: today(), branchCode })}
              meta={tr(RESET_LABELS[s.resetPolicy])}
              icon="numeric"
              divider={i < series.length - 1}
              right={<Badge label={tr('settings:numbering.nextBadge', { number: s.nextNumber })} tone="neutral" size="sm" />}
              onPress={() => open(s)}
              chevron
            />
          ))}
        </Card>
        )}
      </ScrollView>

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? seriesLabel(tr, editing.kind) : ''}
        footer={<Button shortcut="S" title={tr('settings:numbering.save')} onPress={save} loading={saving} disabled={saving || !!numberError || !!prefixError} fullWidth={!desktop} />}
      >
        <View style={{ padding: t.spacing.lg, gap: t.spacing.lg }}>
          <Card style={{ alignItems: 'center', gap: 6, paddingVertical: t.spacing.xl }}>
            <Text variant="caption" tone="muted">{tr('settings:numbering.nextWillBe')}</Text>
            <Text variant="h3" weight="700" style={{ color: t.c.primary, fontVariant: ['tabular-nums'] }}>
              {draft ? formatNumber(draft, { date: today(), branchCode }) : ''}
            </Text>
          </Card>

          <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
            <TextField
              label={tr('settings:numbering.prefix')}
              value={prefix}
              onChangeText={(v) => setPrefix(sanitizePrefix(v))}
              error={prefixError}
              hint={tooLong && !eInvoicing ? tr('settings:numbering.tooLongForEInvoice', { count: E_INVOICE_DOC_NUMBER_MAX }) : undefined}
              autoCapitalize="characters"
              containerStyle={{ flex: 1 }}
            />
            <TextField
              label={tr('settings:numbering.nextNumber')}
              value={nextNumber}
              onChangeText={(v) => setNextNumber(v.replace(/[^0-9]/g, ''))}
              error={numberError}
              keyboardType="number-pad"
              containerStyle={{ flex: 1 }}
            />
          </View>

          <TextField
            label={tr('settings:numbering.digits')}
            value={padding}
            onChangeText={(v) => setPadding(v.replace(/[^0-9]/g, '').slice(0, 1))}
            keyboardType="number-pad"
            hint={tr('settings:numbering.digitsHint')}
          />

          <SwitchField
            label={tr('settings:numbering.includeFy')}
            // The year used to be hardcoded as "26-27", which would have been
            // wrong from April. It comes from the same helper the numbers do.
            description={tr('settings:numbering.fyHint', { fy: financialYearOf(today()).label.replace('FY ', '') })}
            value={includeFy}
            onValueChange={setIncludeFy}
          />
          <SwitchField
            label={tr('settings:numbering.includeBranch')}
            description={tr('settings:numbering.branchHint')}
            value={includeBranch}
            onValueChange={setIncludeBranch}
            disabled={branches.length < 2}
          />
          <PickerField label={tr('settings:numbering.resetPolicy')} value={tr(RESET_LABELS[resetPolicy])} onPress={() => setResetOpen(true)} icon="restart" />
        </View>
      </Sheet>

      <SelectSheet
        visible={resetOpen}
        onClose={() => setResetOpen(false)}
        title={tr('settings:numbering.resetPolicy')}
        options={(Object.keys(RESET_LABELS) as NumberingSeries['resetPolicy'][]).map((k) => ({ value: k, label: tr(RESET_LABELS[k]) }))}
        value={resetPolicy}
        onSelect={(v) => setResetPolicy(v as NumberingSeries['resetPolicy'])}
        searchable={false}
      />
    </View>
  );
}
