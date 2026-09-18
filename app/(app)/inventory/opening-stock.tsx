import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { TextField } from '@/components/Field';
import { DateField } from '@/components/pickers/DateField';
import { SearchBar } from '@/components/SearchBar';
import { EmptyState } from '@/components/EmptyState';
import { useToast } from '@/components/Toast';
import { useAppStore } from '@/store/appStore';
import { useBaseCurrency, useItems, useStockLevels } from '@/store/selectors';
import { formatMoney, formatQty } from '@/lib/format';
import { money } from '@/lib/money';
import { today } from '@/lib/date';

export default function OpeningStock() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const items = useItems().filter((i) => i.trackInventory);
  const stock = useStockLevels();
  const baseCurrency = useBaseCurrency();
  const addStockMovement = useAppStore((s) => s.addStockMovement);
  const activeCompanyId = useAppStore((s) => s.activeCompanyId);
  const activeBranchId = useAppStore((s) => s.activeBranchId);

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
    entered.forEach(([itemId, v]) => {
      const item = items.find((i) => i.id === itemId);
      if (!item) return;
      addStockMovement({
        companyId: activeCompanyId,
        branchId: activeBranchId ?? 'brn_mum',
        itemId,
        type: 'opening',
        quantity: Number(v),
        unitCost: item.purchasePrice,
        date,
        notes: 'Opening stock entry',
      });
    });
    toast.show(`Opening stock set for ${entered.length} item${entered.length === 1 ? '' : 's'}`, 'success');
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: 'Opening stock' }} />

      <View style={{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, gap: t.spacing.md }}>
        <Card variant="flat">
          <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
            Enter what you already had on hand when you started using the app. This posts an opening movement and does not
            affect your sales or purchase figures.
          </Text>
        </Card>
        <DateField label="As on" value={date} onChange={setDate} />
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search items" />
      </View>

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <Card padded={false}>
          {filtered.length === 0 ? (
            <EmptyState icon="package-variant" title="No stock-tracked items" compact />
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
                    {item.sku} · currently {formatQty(stock[item.id] ?? 0)} {item.unit}
                  </Text>
                </View>
                <TextField
                  value={values[item.id] ?? ''}
                  onChangeText={(v) => setValues((s) => ({ ...s, [item.id]: v.replace(/[^0-9.]/g, '') }))}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  containerStyle={{ width: 96 }}
                />
              </View>
            ))
          )}
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
          gap: t.spacing.sm,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="caption" tone="muted">
            {entered.length} items entered
          </Text>
          <Text variant="small" weight="700">
            {formatMoney(money(totalValue, baseCurrency))}
          </Text>
        </View>
        <Button title="Save opening stock" onPress={save} disabled={entered.length === 0} fullWidth size="lg" />
      </View>
    </View>
  );
}
