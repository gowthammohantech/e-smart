import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { AppHeader } from '@/components/AppHeader';
import { SectionHeader } from '@/components/Screen';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { StatRow, StatTile } from '@/components/StatTile';
import { SearchBar } from '@/components/SearchBar';
import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { Fab } from '@/components/Fab';
import { Segmented } from '@/components/Field';
import { Sheet } from '@/components/Sheet';
import { useBaseCurrency, useItems, useStockLevels, useStockMovements } from '@/store/selectors';
import { summarizeStock } from '@/domain/reports';
import { formatMoney, formatQty } from '@/lib/format';
import { isLowStock } from '@/domain/stockLedger';

type Filter = 'all' | 'low' | 'out' | 'services';

export default function InventoryTab() {
  const t = useTheme();
  const router = useRouter();

  const baseCurrency = useBaseCurrency();
  const items = useItems();
  const movements = useStockMovements();
  const stock = useStockLevels();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [actionsOpen, setActionsOpen] = useState(false);

  const report = useMemo(() => summarizeStock(items, movements, baseCurrency), [items, movements, baseCurrency]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      const onHand = stock[i.id] ?? 0;
      if (filter === 'low' && !(i.trackInventory && isLowStock(i, onHand) && onHand > 0)) return false;
      if (filter === 'out' && !(i.trackInventory && onHand <= 0)) return false;
      if (filter === 'services' && i.trackInventory) return false;
      if (q && !`${i.name} ${i.sku} ${i.barcode ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, stock, filter, query]);

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <AppHeader title="Stock" subtitle="Items, levels and movements" />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <StatRow>
          <StatTile label="Stock value" value={report.totalValue} icon="warehouse" caption={`${report.trackedCount} tracked items`} />
          <StatTile
            label="Low stock"
            value={String(report.lowCount)}
            tone="warn"
            icon="alert-outline"
            caption={`${report.outCount} out of stock`}
            onPress={() => router.push('/(app)/inventory/low-stock')}
          />
        </StatRow>

        <View style={{ gap: t.spacing.md, marginTop: t.spacing.xl }}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name, SKU or barcode"
            right={
              <Pressable
                onPress={() => router.push('/(app)/inventory/scan')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Scan barcode"
              >
                <MaterialCommunityIcons name="barcode-scan" size={19} color={t.c.primary} />
              </Pressable>
            }
          />
          <Segmented
            options={[
              { value: 'all', label: 'All' },
              { value: 'low', label: 'Low' },
              { value: 'out', label: 'Out' },
              { value: 'services', label: 'Services' },
            ]}
            value={filter}
            onChange={(v) => setFilter(v as Filter)}
            size="sm"
          />
        </View>

        <SectionHeader title={`${filtered.length} items`} action="Movements" onAction={() => router.push('/(app)/inventory/movements')} />

        <Card padded={false}>
          {filtered.length === 0 ? (
            <EmptyState
              illustration="no-items"
              icon="package-variant"
              title="Nothing here"
              message={items.length === 0 ? 'Add your first item to start tracking stock.' : 'No items match this filter.'}
              actionLabel={items.length === 0 ? 'Add item' : undefined}
              onAction={items.length === 0 ? () => router.push('/(app)/catalog/items/new') : undefined}
              compact
            />
          ) : (
            filtered.map((item, i) => {
              const onHand = stock[item.id] ?? 0;
              const low = item.trackInventory && isLowStock(item, onHand);
              return (
                <Pressable
                  key={item.id}
                  onPress={() => router.push(`/(app)/catalog/items/${item.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name}, ${item.trackInventory ? `${onHand} in stock` : 'service'}`}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: t.spacing.md,
                    padding: t.spacing.lg,
                    borderBottomWidth: i < filtered.length - 1 ? 0.5 : 0,
                    borderBottomColor: t.c.line,
                    backgroundColor: pressed ? t.c.card2 : 'transparent',
                  })}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: t.radius.sm,
                      backgroundColor: item.trackInventory ? t.c.chip : t.c.mutedSoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <MaterialCommunityIcons
                      name={item.trackInventory ? 'package-variant-closed' : 'hammer-wrench'}
                      size={19}
                      color={item.trackInventory ? t.c.primary : t.c.muted}
                    />
                  </View>

                  <View style={{ flex: 1, gap: 3 }}>
                    <Text variant="body" weight="600" numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {item.sku} · {formatMoney(item.salePrice)} / {item.unit}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    {item.trackInventory ? (
                      <>
                        <Text
                          variant="body"
                          weight="700"
                          tone={onHand <= 0 ? 'bad' : low ? 'warn' : 'default'}
                          style={{ fontVariant: ['tabular-nums'] }}
                        >
                          {formatQty(onHand)}
                        </Text>
                        {onHand <= 0 ? (
                          <Badge label="Out" tone="danger" size="sm" />
                        ) : low ? (
                          <Badge label="Low" tone="warning" size="sm" />
                        ) : (
                          <Text variant="micro" tone="muted">
                            {item.unit}
                          </Text>
                        )}
                      </>
                    ) : (
                      <Badge label="Service" tone="neutral" size="sm" />
                    )}
                  </View>
                </Pressable>
              );
            })
          )}
        </Card>
      </ScrollView>

      <Fab icon="plus" onPress={() => setActionsOpen(true)} />

      <Sheet visible={actionsOpen} onClose={() => setActionsOpen(false)} title="Stock actions">
        {[
          { label: 'Add item', icon: 'tag-plus-outline' as const, route: '/(app)/catalog/items/new' },
          { label: 'Stock adjustment', icon: 'tune' as const, route: '/(app)/inventory/adjust' },
          { label: 'Branch transfer', icon: 'swap-horizontal' as const, route: '/(app)/inventory/transfer' },
          { label: 'Set opening stock', icon: 'database-import-outline' as const, route: '/(app)/inventory/opening-stock' },
          { label: 'Scan barcode', icon: 'barcode-scan' as const, route: '/(app)/inventory/scan' },
          { label: 'Stock movements', icon: 'format-list-bulleted' as const, route: '/(app)/inventory/movements' },
        ].map((a) => (
          <Pressable
            key={a.label}
            onPress={() => {
              setActionsOpen(false);
              router.push(a.route as never);
            }}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing.md,
              paddingVertical: t.spacing.md,
              paddingHorizontal: t.spacing.lg,
              backgroundColor: pressed ? t.c.card2 : 'transparent',
            })}
          >
            <MaterialCommunityIcons name={a.icon} size={20} color={t.c.primary} />
            <Text variant="body" style={{ flex: 1 }}>
              {a.label}
            </Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color={t.c.muted} />
          </Pressable>
        ))}
      </Sheet>
    </View>
  );
}
