import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Button } from '@esmart/ui/components/Button';
import { TextField } from '@esmart/ui/components/Field';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { SearchBar } from '@esmart/ui/components/SearchBar';
import { EmptyState, SkeletonList } from '@esmart/ui/components/EmptyState';
import { useServerSave } from '../../../components/useServerSave';
import { useSaveShortcut } from '../../../components/useSaveShortcut';
import { useAppStore } from '../../../store/appStore';
import { useBaseCurrency, useBranches, useDefaultBranchId } from '../../../store/selectors';
import { unitShortName } from '@esmart/core/data/masters';
import { LoadFailed } from '../../../features/company/LoadFailed';
import { useTrackedItems } from '../../../remote/queries';
import { formatMoney, formatQty } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { today } from '@esmart/core/lib/date';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { useGoBack } from '../../../navigation/useGoBack';

export default function OpeningStock() {
  const t = useTheme();
  const { t: tr } = useTranslation(['inventory', 'nav']);
  const goBack = useGoBack();
  const { run: serverSave, saving, blocked } = useServerSave();
  const insets = useSafeAreaInsets();

  // Every tracked item and what's on hand at the active branch, from the server.
  const tracked = useTrackedItems();
  const { items, stock } = tracked;
  const branches = useBranches();
  const baseCurrency = useBaseCurrency();
  const addStockMovement = useAppStore((s) => s.addStockMovement);
  const activeCompanyId = useAppStore((s) => s.activeCompanyId);
  const defaultBranchId = useDefaultBranchId();
  const branchName = branches.find((b) => b.id === defaultBranchId)?.name;

  const [query, setQuery] = useState('');
  const [date, setDate] = useState(today());
  const [values, setValues] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => `${i.name} ${i.sku}`.toLowerCase().includes(q));
  }, [items, query]);

  const entered = Object.entries(values).filter(([, v]) => Number(v) > 0);
  const totalValue = entered.reduce((acc, [id, v]) => {
    const item = items.find((i) => i.id === id);
    return acc + (item?.purchasePrice.minor ?? 0) * Number(v);
  }, 0);

  const save = () => {
    void serverSave(() => {
      entered.forEach(([itemId, v]) => {
        const item = items.find((i) => i.id === itemId);
        if (!item) return;
        addStockMovement({
          companyId: activeCompanyId,
          branchId: defaultBranchId ?? '',
          itemId,
          type: 'opening',
          quantity: Number(v),
          unitCost: item.purchasePrice,
          date,
          notes: tr('inventory:opening.entryNote'),
        });
      });
    }, tr('inventory:opening.done', { count: entered.length }), { icon: 'package-variant-closed-check' }).then((res) => {
      if (res) goBack('/(app)/(tabs)/inventory');
    });
  };
  useSaveShortcut(() => void save(), !saving && entered.length > 0);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: tr('nav:title.openingStock') }} />

      <View style={{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, gap: t.spacing.md }}>
        <Card variant="flat">
          <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
            {tr('inventory:opening.intro')}
          </Text>
          {branches.length > 1 && branchName ? (
            <Text variant="caption" weight="600" style={{ marginTop: t.spacing.xs }}>
              {tr('inventory:opening.forBranch', { branch: branchName })}
            </Text>
          ) : null}
        </Card>
        <DateField label={tr('inventory:opening.asOn')} value={date} onChange={setDate} />
        <SearchBar value={query} onChangeText={setQuery} placeholder={tr('inventory:opening.search')} />
      </View>

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Card padded={false}>
          {tracked.isError && !tracked.data ? (
            <LoadFailed onRetry={tracked.refetch} compact />
          ) : tracked.isPending ? (
            <SkeletonList rows={4} />
          ) : filtered.length === 0 ? (
            <EmptyState illustration="no-items" icon="package-variant" title={tr('inventory:opening.noTracked')} compact />
          ) : (
            filtered.map((item, i) => (
              <View
                key={item.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.spacing.md,
                  padding: t.spacing.lg,
                  borderBottomWidth: i < filtered.length - 1 ? 0.5 : 0,
                  borderBottomColor: t.c.line,
                }}
              >
                <View style={{ flex: 1, gap: 3 }}>
                  <Text variant="body" weight="600" numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {item.sku} · {tr('inventory:opening.currently', { qty: formatQty(stock[item.id] ?? 0), unit: unitShortName(item.unit) || item.unit })}
                  </Text>
                </View>
                <TextField
                  value={values[item.id] ?? ''}
                  onChangeText={(v) => setValues((s) => ({ ...s, [item.id]: v.replace(/[^0-9.]/g, '') }))}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  accessibilityLabel={tr('inventory:opening.qtyFor', { name: item.name })}
                  containerStyle={{ width: 96 }}
                />
              </View>
            ))
          )}
        </Card>
      </ScrollView>

      {/* In the flow, not floating: the keyboard lifts it and it never covers the last rows. */}
      <View
        style={{
          padding: t.spacing.lg,
          paddingBottom: insets.bottom + t.spacing.md,
          borderTopWidth: 1,
          borderTopColor: t.c.line,
          backgroundColor: t.c.paper,
          gap: t.spacing.sm,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="caption" tone="muted">
            {tr('inventory:opening.entered', { count: entered.length })}
          </Text>
          <Text variant="small" weight="700">
            {formatMoney(money(totalValue, baseCurrency))}
          </Text>
        </View>
        <Button shortcut="S" title={tr('inventory:opening.submit')} onPress={() => void save()} loading={saving} disabled={blocked || entered.length === 0} fullWidth size="lg" />
      </View>
    </KeyboardAvoidingView>
  );
}
