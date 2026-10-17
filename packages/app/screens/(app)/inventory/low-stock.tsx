import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { PrimaryActionBar } from '@esmart/ui/components/ActionBar';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { StatRow, StatTile } from '@esmart/ui/components/StatTile';
import { useBaseCurrency, useItems, useStockLevels, useStockMovements } from '../../../store/selectors';
import { summarizeStock } from '@esmart/core/domain/reports';
import { isLowStock } from '@esmart/core/domain/stockLedger';
import { formatMoney, formatQty } from '@esmart/core/lib/format';
import { multiply } from '@esmart/core/lib/money';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';

export default function LowStock() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation(['inventory', 'nav']);
  const router = useRouter();

  const items = useItems({ activeOnly: true });
  const stock = useStockLevels();
  const movements = useStockMovements();
  const baseCurrency = useBaseCurrency();

  const report = useMemo(() => summarizeStock(items, movements, baseCurrency), [items, movements, baseCurrency]);

  const rows = useMemo(
    () =>
      items
        .filter((i) => i.trackInventory)
        .map((i) => ({ item: i, onHand: stock[i.id] ?? 0 }))
        .filter((r) => isLowStock(r.item, r.onHand))
        .sort((a, b) => a.onHand - b.onHand),
    [items, stock],
  );

  const suggestedValue = rows.reduce((acc, r) => {
    const shortfall = Math.max(0, r.item.reorderLevel * 2 - r.onHand);
    return acc + r.item.purchasePrice.minor * shortfall;
  }, 0);

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.lowStock') }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 + insets.bottom }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <StatRow>
          <StatTile label={tr('inventory:lowStock.needAttention')} value={String(rows.length)} tone="warn" icon="alert-outline" caption={`${report.outCount} out of stock`} />
          <StatTile
            label={tr('inventory:lowStock.restockCost')}
            value={{ minor: suggestedValue, currency: baseCurrency }}
            icon="cart-outline"
            caption={tr('inventory:lowStock.restockCaption')}
          />
        </StatRow>

        <View style={{ height: t.spacing.lg }} />

        <Card padded={false}>
          {rows.length === 0 ? (
            <EmptyState illustration="all-settled" icon="check-all" title={tr('inventory:lowStock.allStocked')} message={tr('inventory:lowStock.allStockedBody')} compact />
          ) : (
            rows.map((r, i) => {
              const shortfall = Math.max(0, r.item.reorderLevel * 2 - r.onHand);
              return (
                <Pressable
                  key={r.item.id}
                  onPress={() => router.push(`/(app)/catalog/items/${r.item.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.item.name}, ${r.onHand} in stock`}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: t.spacing.md,
                    padding: t.spacing.lg,
                    borderBottomWidth: i < rows.length - 1 ? 0.5 : 0,
                    borderBottomColor: t.c.line,
                    backgroundColor: pressed ? t.c.card2 : 'transparent',
                  })}
                >
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: t.radius.sm,
                      backgroundColor: r.onHand <= 0 ? t.c.badSoft : t.c.warnSoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <MaterialCommunityIcons name="package-variant" size={19} color={r.onHand <= 0 ? t.c.bad : t.c.warn} />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text variant="body" weight="600" numberOfLines={1}>
                      {r.item.name}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {r.item.sku} · reorder at {formatQty(r.item.reorderLevel)} {r.item.unit}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text variant="body" weight="700" tone={r.onHand <= 0 ? 'bad' : 'warn'}>
                      {formatQty(r.onHand)}
                    </Text>
                    {r.onHand <= 0 ? (
                      <Badge label={tr('inventory:lowStock.out')} tone="danger" size="sm" />
                    ) : (
                      <Text variant="micro" tone="muted">
                        buy {formatQty(shortfall)} ≈ {formatMoney(multiply(r.item.purchasePrice, shortfall))}
                      </Text>
                    )}
                  </View>
                </Pressable>
              );
            })
          )}
        </Card>
      </ScrollView>

      {rows.length > 0 ? (
        <PrimaryActionBar title={tr('inventory:lowStock.raisePo')} icon="cart-plus" onPress={() => router.push('/(app)/purchases/orders/new')} />
      ) : null}
    </View>
  );
}
