import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { AppHeader } from '../../../components/AppHeader';
import { SectionHeader } from '@esmart/ui/components/Screen';
import { Card } from '@esmart/ui/components/Card';
import { Text } from '@esmart/ui/components/Text';
import { StatRow, StatTile } from '@esmart/ui/components/StatTile';
import { SearchBar } from '@esmart/ui/components/SearchBar';
import { Badge } from '@esmart/ui/components/Badge';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Fab } from '@esmart/ui/components/Fab';
import { Segmented } from '@esmart/ui/components/Field';
import { Sheet } from '@esmart/ui/components/Sheet';
import { useBaseCurrency, useItems, useStockLevels, useStockMovements } from '../../../store/selectors';
import { summarizeStock } from '@esmart/core/domain/reports';
import { formatMoney, formatQty } from '@esmart/core/lib/format';
import { isLowStock } from '@esmart/core/domain/stockLedger';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { useQueryParams } from '../../../navigation/queryParams';

type Filter = 'all' | 'low' | 'out' | 'services';
const FILTERS: Filter[] = ['all', 'low', 'out', 'services'];

export default function InventoryTab() {
  const t = useTheme();
  const { t: tr } = useTranslation(['inventory', 'common', 'nav']);
  const router = useRouter();

  const baseCurrency = useBaseCurrency();
  const items = useItems();
  const movements = useStockMovements(undefined, { branchScoped: true });
  const stock = useStockLevels();

  const [query, setQuery] = useState('');
  // The stock filter lives in the URL (`?filter=low`); search stays local.
  const [params, setParams] = useQueryParams();
  const filter: Filter = FILTERS.includes(params.filter as Filter) ? (params.filter as Filter) : 'all';
  const setFilter = (f: Filter) => setParams({ filter: f === 'all' ? undefined : f });
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
      <AppHeader title={tr('inventory:hub.title')} subtitle={tr('inventory:hub.subtitle')} />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: 120 }}
        showsVerticalScrollIndicator={SHOW_SCROLLBAR}
      >
        <StatRow>
          <StatTile label={tr('inventory:hub.stockValue')} value={report.totalValue} icon="warehouse" caption={tr('inventory:hub.trackedItems', { count: report.trackedCount })} />
          <StatTile
            label={tr('inventory:hub.lowStock')}
            value={String(report.lowCount)}
            tone="warn"
            icon="alert-outline"
            caption={tr('inventory:hub.outOfStock', { count: report.outCount })}
            onPress={() => router.push('/(app)/inventory/low-stock')}
          />
        </StatRow>

        <View style={{ gap: t.spacing.md, marginTop: t.spacing.xl }}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder={tr('inventory:hub.searchPlaceholder')}
            right={
              <Pressable
                onPress={() => router.push('/(app)/inventory/scan')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={tr('inventory:hub.scanBarcode')}
              >
                <Icon name="barcode-scan" size={19} color={t.c.primary} />
              </Pressable>
            }
          />
          <Segmented
            options={[
              { value: 'all', label: tr('inventory:hub.all') },
              { value: 'low', label: tr('inventory:hub.low') },
              { value: 'out', label: tr('inventory:hub.out') },
              { value: 'services', label: tr('inventory:catalog.services') },
            ]}
            value={filter}
            onChange={(v) => setFilter(v as Filter)}
            size="sm"
          />
        </View>

        <SectionHeader title={tr('inventory:hub.itemCount', { count: filtered.length })} action={tr('inventory:hub.movements')} onAction={() => router.push('/(app)/inventory/movements')} />

        <Card padded={false}>
          {filtered.length === 0 ? (
            <EmptyState
              illustration="no-items"
              icon="package-variant"
              title={tr('inventory:hub.nothingHere')}
              message={items.length === 0 ? tr('inventory:hub.emptyFirst') : tr('inventory:hub.emptyFilter')}
              actionLabel={items.length === 0 ? tr('common:quickAction.addItem') : undefined}
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
                  accessibilityLabel={
                    item.trackInventory
                      ? tr('inventory:hub.a11yStock', { name: item.name, qty: formatQty(onHand) })
                      : tr('inventory:hub.a11yService', { name: item.name })
                  }
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
                    <Icon
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
                          <Badge label={tr('inventory:hub.out')} tone="danger" size="sm" />
                        ) : low ? (
                          <Badge label={tr('inventory:hub.low')} tone="warning" size="sm" />
                        ) : (
                          <Text variant="micro" tone="muted">
                            {item.unit}
                          </Text>
                        )}
                      </>
                    ) : (
                      <Badge label={tr('inventory:hub.service')} tone="neutral" size="sm" />
                    )}
                  </View>
                </Pressable>
              );
            })
          )}
        </Card>
      </ScrollView>

      <Fab icon="plus" onPress={() => setActionsOpen(true)} />

      <Sheet visible={actionsOpen} onClose={() => setActionsOpen(false)} title={tr('inventory:hub.actions')}>
        {[
          { label: tr('common:quickAction.addItem'), icon: 'tag-plus-outline' as const, route: '/(app)/catalog/items/new' },
          { label: tr('nav:title.stockAdjustment'), icon: 'tune' as const, route: '/(app)/inventory/adjust' },
          { label: tr('nav:title.branchTransfer'), icon: 'swap-horizontal' as const, route: '/(app)/inventory/transfer' },
          { label: tr('inventory:hub.setOpeningStock'), icon: 'database-import-outline' as const, route: '/(app)/inventory/opening-stock' },
          { label: tr('inventory:hub.scanBarcode'), icon: 'barcode-scan' as const, route: '/(app)/inventory/scan' },
          { label: tr('nav:title.stockMovements'), icon: 'format-list-bulleted' as const, route: '/(app)/inventory/movements' },
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
            <Icon name={a.icon} size={20} color={t.c.primary} />
            <Text variant="body" style={{ flex: 1 }}>
              {a.label}
            </Text>
            <Icon name="chevron-right" size={18} color={t.c.muted} />
          </Pressable>
        ))}
      </Sheet>
    </View>
  );
}
