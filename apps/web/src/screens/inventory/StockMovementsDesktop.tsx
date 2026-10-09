import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { Cell, DataTable } from '@esmart/ui/components/DataTable';
import { SearchBar } from '@esmart/ui/components/SearchBar';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import type { StockMovement, StockMovementType } from '@esmart/core/types';
import { MOVEMENT_LABELS, signedQuantity } from '@esmart/core/domain/stockLedger';
import { formatQty } from '@esmart/core/lib/format';
import { formatDate } from '@esmart/core/lib/date';
import { useBranches, useItems, useStockMovements } from '@esmart/app/store/selectors';

const TYPES: (StockMovementType | 'all')[] = ['all', 'purchaseReceipt', 'salesIssue', 'adjustment', 'transferIn', 'transferOut', 'salesReturn', 'purchaseReturn', 'opening'];

const LIMIT = 200;

/**
 * Stock movements for a desktop: search and type filters in one toolbar, then
 * the ledger as a table. Same data as the phone screen
 * (`@esmart/app/screens/(app)/inventory/movements`).
 */
export function StockMovementsDesktop() {
  const t = useTheme();
  const { t: tr } = useTranslation(['inventory', 'nav']);
  const router = useRouter();

  const movements = useStockMovements();
  const items = useItems();
  const branches = useBranches();

  const [query, setQuery] = useState('');
  const [type, setType] = useState<StockMovementType | 'all'>('all');

  const itemOf = useCallback((id: string) => items.find((i) => i.id === id), [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return movements
      .filter((m) => {
        if (type !== 'all' && m.type !== type) return false;
        if (!q) return true;
        const item = itemOf(m.itemId);
        return `${item?.name ?? ''} ${item?.sku ?? ''} ${m.referenceNumber ?? ''} ${m.notes ?? ''}`.toLowerCase().includes(q);
      })
      .sort((a, b) => (b.date === a.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)));
  }, [movements, query, type, itemOf]);

  const shown = filtered.slice(0, LIMIT);
  const showBranch = branches.length > 1;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.stockMovements') }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 48, gap: t.spacing.lg }}>
        {/* Toolbar */}
        <View style={{ gap: t.spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.lg }}>
            <SearchBar value={query} onChangeText={setQuery} placeholder={tr('inventory:movements.search')} style={{ flex: 1, maxWidth: 520 }} />
            <Text variant="small" tone="muted">
              {filtered.length} movements
            </Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
            {TYPES.map((ty) => {
              const active = type === ty;
              return (
                <Pressable
                  key={ty}
                  onPress={() => setType(ty)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={(state) => {
                    const { hovered, focused } = state as WebPressState;
                    return [
                      {
                        paddingHorizontal: t.spacing.md,
                        paddingVertical: 6,
                        borderRadius: t.radius.pill,
                        backgroundColor: active ? t.c.primary : hovered ? t.c.card2 : t.c.card,
                        borderWidth: active ? 0 : 1,
                        borderColor: t.c.line,
                      },
                      focusRing(t, focused),
                    ];
                  }}
                >
                  <Text variant="caption" weight="600" style={{ color: active ? t.c.onPrimary : t.c.muted }}>
                    {ty === 'all' ? 'All' : MOVEMENT_LABELS[ty]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {shown.length === 0 ? (
          <Card padded={false}>
            <EmptyState illustration="no-movements" icon="swap-vertical" title={tr('inventory:movements.none')} message={tr('inventory:movements.noneBody')} compact />
          </Card>
        ) : (
          <DataTable<StockMovement>
            scroll={false}
            columns={[
              {
                key: 'date',
                header: 'Date',
                width: 110,
                sortValue: (m) => m.date,
                render: (m) => <Cell tone="muted">{formatDate(m.date, 'dd MMM yyyy')}</Cell>,
              },
              {
                key: 'item',
                header: 'Item',
                flex: 3,
                sortValue: (m) => itemOf(m.itemId)?.name ?? '',
                render: (m) => {
                  const item = itemOf(m.itemId);
                  return (
                    <View style={{ flexShrink: 1 }}>
                      <Cell weight="600">{item?.name ?? 'Unknown item'}</Cell>
                      {item ? <Cell tone="muted">{item.sku}</Cell> : null}
                    </View>
                  );
                },
              },
              {
                key: 'type',
                header: 'Type',
                flex: 1.6,
                sortValue: (m) => MOVEMENT_LABELS[m.type],
                render: (m) => {
                  const delta = signedQuantity(m);
                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                      <MaterialCommunityIcons
                        name={delta >= 0 ? 'arrow-down-bold-circle-outline' : 'arrow-up-bold-circle-outline'}
                        size={18}
                        color={delta >= 0 ? t.c.good : t.c.bad}
                      />
                      <Cell>{MOVEMENT_LABELS[m.type]}</Cell>
                    </View>
                  );
                },
              },
              {
                key: 'reference',
                header: 'Reference',
                flex: 1.4,
                secondary: true,
                render: (m) => <Cell tone="muted">{m.referenceNumber ?? '—'}</Cell>,
              },
              ...(showBranch
                ? [
                    {
                      key: 'branch',
                      header: 'Branch',
                      width: 100,
                      secondary: true,
                      render: (m: StockMovement) => {
                        const branch = branches.find((b) => b.id === m.branchId);
                        return branch ? <Badge label={branch.code} tone="neutral" size="sm" /> : <Cell tone="muted">—</Cell>;
                      },
                    },
                  ]
                : []),
              {
                key: 'qty',
                header: 'Quantity',
                width: 120,
                align: 'right' as const,
                sortValue: (m) => signedQuantity(m),
                render: (m) => {
                  const delta = signedQuantity(m);
                  return (
                    <Cell weight="700" mono tone={delta >= 0 ? 'good' : 'bad'}>
                      {`${delta >= 0 ? '+' : ''}${formatQty(delta)}`}
                    </Cell>
                  );
                },
              },
            ]}
            rows={shown}
            rowKey={(m) => m.id}
            onRowPress={(m) => {
              const item = itemOf(m.itemId);
              if (item) router.push(`/(app)/catalog/items/${item.id}`);
            }}
            rowLabel={(m) => `${itemOf(m.itemId)?.name ?? 'Item'}, ${MOVEMENT_LABELS[m.type]}, ${signedQuantity(m)}`}
          />
        )}
      </ScrollView>
    </View>
  );
}
