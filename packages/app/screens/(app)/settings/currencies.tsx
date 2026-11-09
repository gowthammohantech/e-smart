import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { SheetActions } from '../../../features/company/SheetActions';
import { PrimaryActionBar } from '@esmart/ui/components/ActionBar';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Sheet } from '@esmart/ui/components/Sheet';
import { PickerField, TextField } from '@esmart/ui/components/Field';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Sparkline } from '@esmart/ui/components/charts/BarChart';
import { ExchangeRate } from '@esmart/core/types';
import { useAppStore } from '../../../store/appStore';
import { useActiveCompany, useBaseCurrency, useExchangeRates } from '../../../store/selectors';
import { CURRENCIES, currencyMeta } from '@esmart/core/lib/currencies';
import { formatDate, today } from '@esmart/core/lib/date';
import { uid } from '@esmart/core/lib/id';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { FieldRow } from '@esmart/ui/components/Layout';
import { useSaveShortcut } from '../../../components/useSaveShortcut';
import { useServerSave } from '../../../components/useServerSave';

export default function CurrencySettings() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const desktop = useIsDesktop();
  const { t: tr } = useTranslation(['nav', 'settings']);
  const sourceLabel = (source: ExchangeRate['source']) => (source === 'provider' ? tr('settings:currencies.sourceProvider') : tr('settings:currencies.sourceManual'));
  const { run: serverSave, saving } = useServerSave();

  const company = useActiveCompany();
  const baseCurrency = useBaseCurrency();
  const rates = useExchangeRates();
  const saveExchangeRate = useAppStore((s) => s.saveExchangeRate);
  const removeExchangeRate = useAppStore((s) => s.removeExchangeRate);

  const [editing, setEditing] = useState<ExchangeRate | null>(null);
  const [from, setFrom] = useState('USD');
  const [rate, setRate] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const [fromOpen, setFromOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ExchangeRate | null>(null);

  // Latest rate per currency pair, with its history for the sparkline.
  const pairs = useMemo(() => {
    const map = new Map<string, ExchangeRate[]>();
    rates.forEach((r) => {
      const key = r.from;
      map.set(key, [...(map.get(key) ?? []), r]);
    });
    return Array.from(map.entries()).map(([code, list]) => {
      const sorted = [...list].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
      return { code, latest: sorted[0], history: [...sorted].reverse() };
    });
  }, [rates]);

  const open = (r?: ExchangeRate) => {
    setEditing(r ?? ({ id: '', companyId: company.id, from: 'USD', to: baseCurrency, rate: 0, effectiveFrom: today(), source: 'manual' } as ExchangeRate));
    setFrom(r?.from ?? 'USD');
    setRate(r ? String(r.rate) : '');
    setEffectiveFrom(r?.effectiveFrom ?? today());
  };

  const save = async () => {
    if (!editing || !Number(rate)) return;
    const exchangeRate: ExchangeRate = {
      ...editing,
      id: editing.id || uid('fx'),
      companyId: company.id,
      from,
      to: baseCurrency,
      rate: Number(rate),
      effectiveFrom,
      source: 'manual',
    };
    // The sheet stays open until the server has it, so a refusal can be fixed here.
    const res = await serverSave(() => saveExchangeRate(exchangeRate), tr('settings:currencies.saved'), { icon: 'currency-inr' });
    if (res) setEditing(null);
  };

  // Ctrl+S (⌘+S) does what Save does, while the form is open.
  useSaveShortcut(save, !!editing && !!Number(rate));

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.currenciesAndRates') }} />

      {/* The add button sits in the page header on a desktop, so no room is kept for a bottom bar. */}
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: desktop ? t.spacing.xxl : 120 + insets.bottom }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Card style={{ gap: t.spacing.sm }}>
          <Text variant="caption" tone="muted">{tr('settings:currencies.baseCurrency')}</Text>
          <Text variant="h3" weight="700">
            {currencyMeta(baseCurrency).name} ({baseCurrency})
          </Text>
          <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
            {tr('settings:currencies.baseNote')}
          </Text>
        </Card>

        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginTop: t.spacing.xl, marginBottom: t.spacing.sm }}>{tr('settings:currencies.rates')}</Text>

        <Card padded={false}>
          {pairs.length === 0 ? (
            <EmptyState icon="currency-usd-off" title={tr('settings:currencies.none')} message={tr('settings:currencies.noneBody')} compact />
          ) : (
            pairs.map((p, i) => (
              <ListRow
                key={p.code}
                title={`1 ${p.code} = ${p.latest.rate.toFixed(4)} ${baseCurrency}`}
                subtitle={currencyMeta(p.code).name}
                meta={tr('settings:currencies.pairMeta', { date: formatDate(p.latest.effectiveFrom), count: p.history.length })}
                icon="swap-horizontal"
                divider={i < pairs.length - 1}
                right={
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Sparkline values={p.history.map((h) => h.rate)} width={54} height={20} />
                    <Badge label={sourceLabel(p.latest.source)} tone={p.latest.source === 'provider' ? 'success' : 'neutral'} size="sm" />
                  </View>
                }
                onPress={() => open(p.latest)}
                chevron
              />
            ))
          )}
        </Card>

        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginTop: t.spacing.xl, marginBottom: t.spacing.sm }}>{tr('settings:currencies.history')}</Text>
        <Card padded={false}>
          {rates.slice(0, 12).map((r, i) => (
            <ListRow
              key={r.id}
              title={`${r.from} → ${r.to}`}
              subtitle={tr('settings:currencies.historyRow', { rate: r.rate.toFixed(4), date: formatDate(r.effectiveFrom) })}
              icon="history"
              divider={i < Math.min(rates.length, 12) - 1}
              right={<Badge label={sourceLabel(r.source)} tone="neutral" size="sm" />}
              onPress={() => open(r)}
            />
          ))}
        </Card>
      </ScrollView>

      <PrimaryActionBar title={tr('settings:currencies.add')} icon="plus" onPress={() => open()} />

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? tr('settings:currencies.editTitle') : tr('settings:currencies.add')}
        footer={
          <SheetActions
            saveLabel={tr('settings:currencies.save')}
            onSave={save}
            saving={saving}
            saveDisabled={!Number(rate)}
            deleteLabel={tr('settings:currencies.delete')}
            onDelete={
              editing?.id
                ? () => {
                    // Asked first, as every other delete in Settings is.
                    const r = editing;
                    setEditing(null);
                    setConfirmDelete(r);
                  }
                : undefined
            }
          />
        }
      >
        <View style={{ padding: t.spacing.lg, gap: t.spacing.lg }}>
          <PickerField label={tr('settings:currencies.currency')} value={`${currencyMeta(from).name} (${from})`} onPress={() => setFromOpen(true)} icon="cash-multiple" />
          <FieldRow>
          <TextField
            label={tr('settings:currencies.rateLabel', { from, to: baseCurrency })}
            value={rate}
            onChangeText={(v) => setRate(v.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
            placeholder="0.0000"
            icon="swap-horizontal"
            required
          />
          <DateField label={tr('settings:currencies.effectiveFrom')} value={effectiveFrom} onChange={setEffectiveFrom} hint={tr('settings:currencies.effectiveHint')} />
          </FieldRow>
        </View>
      </Sheet>

      <SelectSheet
        visible={fromOpen}
        onClose={() => setFromOpen(false)}
        title={tr('settings:currencies.currency')}
        options={CURRENCIES.filter((c) => c.code !== baseCurrency).map((c) => ({ value: c.code, label: `${c.name} (${c.code})`, trailing: c.symbol }))}
        value={from}
        onSelect={setFrom}
      />

      <ConfirmDialog
        visible={!!confirmDelete}
        title={tr('settings:currencies.deleteTitle', { code: confirmDelete?.from ?? '', date: confirmDelete ? formatDate(confirmDelete.effectiveFrom) : '' })}
        message={tr('settings:currencies.deleteMessage')}
        confirmLabel={tr('settings:currencies.delete')}
        destructive
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          const r = confirmDelete;
          setConfirmDelete(null);
          if (r) void serverSave(() => removeExchangeRate(r.id), tr('settings:currencies.deleted'), { icon: 'currency-usd-off' });
        }}
      />
    </View>
  );
}
