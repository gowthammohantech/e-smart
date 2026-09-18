import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ListRow } from '@/components/ListRow';
import { Sheet } from '@/components/Sheet';
import { PickerField, TextField } from '@/components/Field';
import { DateField } from '@/components/pickers/DateField';
import { SelectSheet } from '@/components/pickers/SelectSheet';
import { EmptyState } from '@/components/EmptyState';
import { Sparkline } from '@/components/charts/BarChart';
import { useToast } from '@/components/Toast';
import { ExchangeRate } from '@/types';
import { useAppStore } from '@/store/appStore';
import { useActiveCompany, useBaseCurrency, useExchangeRates } from '@/store/selectors';
import { CURRENCIES, currencyMeta } from '@/lib/currencies';
import { formatDate, today } from '@/lib/date';
import { uid } from '@/lib/id';

export default function CurrencySettings() {
  const t = useTheme();
  const toast = useToast();

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

  const save = () => {
    if (!editing || !Number(rate)) return;
    saveExchangeRate({
      ...editing,
      id: editing.id || uid('fx'),
      companyId: company.id,
      from,
      to: baseCurrency,
      rate: Number(rate),
      effectiveFrom,
      source: 'manual',
    });
    toast.show('Exchange rate saved', 'success');
    setEditing(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: 'Currencies & rates' }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <Card style={{ gap: t.spacing.sm }}>
          <Text variant="caption" tone="muted">
            Base currency
          </Text>
          <Text variant="h3" weight="700">
            {currencyMeta(baseCurrency).name} ({baseCurrency})
          </Text>
          <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
            Every report is presented in this currency. Documents raised in another currency store the rate that applied on
            their date, so historical totals never shift.
          </Text>
        </Card>

        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginTop: t.spacing.xl, marginBottom: t.spacing.sm }}>
          Exchange rates
        </Text>

        <Card padded={false}>
          {pairs.length === 0 ? (
            <EmptyState icon="currency-usd-off" title="No rates yet" message="Add a rate to invoice in another currency." compact />
          ) : (
            pairs.map((p, i) => (
              <ListRow
                key={p.code}
                title={`1 ${p.code} = ${p.latest.rate.toFixed(4)} ${baseCurrency}`}
                subtitle={currencyMeta(p.code).name}
                meta={`From ${formatDate(p.latest.effectiveFrom)} · ${p.history.length} rate${p.history.length === 1 ? '' : 's'} on record`}
                icon="swap-horizontal"
                divider={i < pairs.length - 1}
                right={
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Sparkline values={p.history.map((h) => h.rate)} width={54} height={20} />
                    <Badge label={p.latest.source} tone={p.latest.source === 'provider' ? 'success' : 'neutral'} size="sm" />
                  </View>
                }
                onPress={() => open(p.latest)}
                chevron
              />
            ))
          )}
        </Card>

        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginTop: t.spacing.xl, marginBottom: t.spacing.sm }}>
          Rate history
        </Text>
        <Card padded={false}>
          {rates.slice(0, 12).map((r, i) => (
            <ListRow
              key={r.id}
              title={`${r.from} → ${r.to}`}
              subtitle={`${r.rate.toFixed(4)} · from ${formatDate(r.effectiveFrom)}`}
              icon="history"
              divider={i < Math.min(rates.length, 12) - 1}
              right={<Badge label={r.source} tone="neutral" size="sm" />}
              onPress={() => open(r)}
            />
          ))}
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
        <Button title="Add exchange rate" icon="plus" onPress={() => open()} fullWidth size="lg" />
      </View>

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit rate' : 'Add exchange rate'}
        footer={
          <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
            {editing?.id ? (
              <Button
                title="Delete"
                variant="danger"
                style={{ flex: 1 }}
                onPress={() => {
                  if (editing.id) removeExchangeRate(editing.id);
                  setEditing(null);
                  toast.show('Rate deleted', 'success');
                }}
              />
            ) : null}
            <Button title="Save" onPress={save} disabled={!Number(rate)} style={{ flex: 2 }} />
          </View>
        }
      >
        <View style={{ padding: t.spacing.lg, gap: t.spacing.lg }}>
          <PickerField label="Currency" value={`${currencyMeta(from).name} (${from})`} onPress={() => setFromOpen(true)} icon="cash-multiple" />
          <TextField
            label={`Rate (1 ${from} → ${baseCurrency})`}
            value={rate}
            onChangeText={(v) => setRate(v.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
            placeholder="0.0000"
            icon="swap-horizontal"
            required
          />
          <DateField label="Effective from" value={effectiveFrom} onChange={setEffectiveFrom} hint="Documents dated on or after this use the new rate." />
        </View>
      </Sheet>

      <SelectSheet
        visible={fromOpen}
        onClose={() => setFromOpen(false)}
        title="Currency"
        options={CURRENCIES.filter((c) => c.code !== baseCurrency).map((c) => ({ value: c.code, label: `${c.name} (${c.code})`, trailing: c.symbol }))}
        value={from}
        onSelect={setFrom}
      />
    </View>
  );
}
