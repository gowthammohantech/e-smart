import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Icon } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { Cell, DataTable } from '@esmart/ui/components/DataTable';
import { Button } from '@esmart/ui/components/Button';
import { SearchBar } from '@esmart/ui/components/SearchBar';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import type { StockMovement, StockMovementType } from '@esmart/core/types';
import { MOVEMENT_LABELS, signedQuantity } from '@esmart/core/domain/stockLedger';
import { formatQty } from '@esmart/core/lib/format';
import { formatDate } from '@esmart/core/lib/date';
import { useBranches } from '@esmart/app/store/selectors';
import { useAppStore } from '@esmart/app/store/appStore';
import { useMovementPages } from '@esmart/app/remote/queries';
import { useDebounced } from '@esmart/app/components/useDebounced';
import { useQueryParams } from '@esmart/app/navigation/queryParams';

const TYPES: (StockMovementType | 'all')[] = ['all', 'purchaseReceipt', 'salesIssue', 'adjustment', 'transferIn', 'transferOut', 'salesReturn', 'purchaseReturn', 'opening'];

/**
 * Stock movements for a desktop: search and type filters in one toolbar, then
 * the ledger as a table. Same data as the phone screen
 * (`@esmart/app/screens/(app)/inventory/movements`).
 */
export function StockMovementsDesktop() {
  const t = useTheme();
  const { t: tr } = useTranslation(['inventory', 'nav', 'common']);
  const router = useRouter();

  const branches = useBranches();

  const [query, setQuery] = useState('');
  // The type filter lives in the URL (`?type=sale`); search stays local.
  const [params, setParams] = useQueryParams();
  const type = (params.type ?? 'all') as StockMovementType | 'all';
  const setType = (ty: StockMovementType | 'all') => setParams({ type: ty === 'all' ? undefined : ty });

  // Read from the server 50 at a time, newest first; type and search are filtered there, and each row names its item.
  const branchId = useAppStore((s) => s.activeBranchId) || undefined;
  const search = useDebounced(query);
  const pages = useMovementPages({ branchId, type: type === 'all' ? undefined : type, q: search });
  const filtered = pages.rows as unknown as (StockMovement & { itemName?: string; itemSku?: string })[];
  const names = useMemo(() => new Map(filtered.map((m) => [m.itemId, { name: m.itemName ?? '', sku: m.itemSku ?? '' }])), [filtered]);
  const itemOf = useCallback((id: string) => (names.has(id) ? { id, ...names.get(id)! } : undefined), [names]);


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

        {pages.isLoading && !filtered.length ? (
          <ActivityIndicator color={t.c.muted} style={{ padding: t.spacing.xl }} />
        ) : filtered.length === 0 ? (
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
                render: (m) => <Cell tone="muted">{formatDate(m.date, 'dd MMM yyyy')}</Cell>,
              },
              {
                key: 'item',
                header: 'Item',
                flex: 3,
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
                render: (m) => {
                  const delta = signedQuantity(m);
                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                      <Icon
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
            rows={filtered}
            rowKey={(m) => m.id}
            onRowPress={(m) => {
              const item = itemOf(m.itemId);
              if (item) router.push(`/(app)/catalog/items/${item.id}`);
            }}
            rowLabel={(m) => `${itemOf(m.itemId)?.name ?? 'Item'}, ${MOVEMENT_LABELS[m.type]}, ${signedQuantity(m)}`}
          />
        )}
        {pages.hasNextPage ? (
          <View style={{ alignItems: 'center', paddingVertical: t.spacing.md }}>
            {pages.isFetchingNextPage ? <ActivityIndicator color={t.c.muted} /> : <Button title={tr('common:documentList.loadMore')} variant="ghost" size="sm" onPress={() => void pages.fetchNextPage()} />}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
