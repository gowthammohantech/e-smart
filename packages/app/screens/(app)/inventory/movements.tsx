import React, { useMemo, useState, useCallback} from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Icon } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { SearchBar } from '@esmart/ui/components/SearchBar';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { useBranches } from '../../../store/selectors';
import { useAppStore } from '../../../store/appStore';
import { useMovementPages } from '../../../remote/queries';
import { useDebounced } from '../../../components/useDebounced';
import { useQueryParams } from '../../../navigation/queryParams';
import { signedQuantity } from '@esmart/core/domain/stockLedger';
import { StockMovement, StockMovementType } from '@esmart/core/types';
import { formatQty } from '@esmart/core/lib/format';
import { formatDate } from '@esmart/core/lib/date';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { CardRowsSkeleton, MoreRowsSkeleton } from '../../../components/ScreenSkeleton';

const TYPES: (StockMovementType | 'all')[] = ['all', 'purchaseReceipt', 'salesIssue', 'adjustment', 'transferIn', 'transferOut', 'salesReturn', 'purchaseReturn', 'opening'];

export default function StockMovements() {
  const t = useTheme();
  const { t: tr } = useTranslation(['inventory', 'nav']);
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
  const nameOf = useCallback((id: string) => (names.has(id) ? { id, ...names.get(id)! } : undefined), [names]);


  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.stockMovements') }} />

      <View style={{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, gap: t.spacing.md }}>
        <SearchBar value={query} onChangeText={setQuery} placeholder={tr('inventory:movements.search')} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.spacing.sm, paddingRight: t.spacing.lg }}>
          {TYPES.map((ty) => {
            const active = type === ty;
            return (
              <Pressable
                key={ty}
                onPress={() => setType(ty)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={{
                  paddingHorizontal: t.spacing.md,
                  paddingVertical: 6,
                  borderRadius: t.radius.pill,
                  backgroundColor: active ? t.c.primary : t.c.card,
                  borderWidth: active ? 0 : 1,
                  borderColor: t.c.line,
                }}
              >
                <Text variant="caption" weight="600" style={{ color: active ? t.c.onPrimary : t.c.muted }}>
                  {ty === 'all' ? tr('inventory:movements.all') : tr(`inventory:movementType.${ty}`)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Text variant="caption" tone="muted">
          {tr('inventory:movements.count', { count: filtered.length })}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40 }}
        showsVerticalScrollIndicator={SHOW_SCROLLBAR}
        // The next page loads before the end is reached, so scrolling rarely waits.
        onScroll={({ nativeEvent: e }: NativeSyntheticEvent<NativeScrollEvent>) => {
          if (e.layoutMeasurement.height + e.contentOffset.y >= e.contentSize.height - 600 && pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage();
        }}
        scrollEventThrottle={200}
      >
        <Card padded={false}>
          {pages.isLoading && !filtered.length ? (
            <CardRowsSkeleton kind="list" />
          ) : filtered.length === 0 ? (
            <EmptyState illustration="no-movements" icon="swap-vertical" title={tr('inventory:movements.none')} message={tr('inventory:movements.noneBody')} compact />
          ) : (
            filtered.map((m, i) => {
              const item = nameOf(m.itemId);
              const delta = signedQuantity(m);
              const branch = branches.find((b) => b.id === m.branchId);
              return (
                <Pressable
                  key={m.id}
                  onPress={() => item && router.push(`/(app)/catalog/items/${item.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={tr('inventory:movements.a11yRow', {
                    name: item?.name ?? tr('inventory:movements.unknownItem'),
                    type: tr(`inventory:movementType.${m.type}`),
                    qty: formatQty(delta),
                  })}
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
                  <Icon
                    name={delta >= 0 ? 'arrow-down-bold-circle-outline' : 'arrow-up-bold-circle-outline'}
                    size={21}
                    color={delta >= 0 ? t.c.good : t.c.bad}
                  />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text variant="body" weight="600" numberOfLines={1}>
                      {item?.name ?? tr('inventory:movements.unknownItem')}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {tr(`inventory:movementType.${m.type}`)} · {formatDate(m.date, 'dd MMM')}
                      {m.referenceNumber ? ` · ${m.referenceNumber}` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text variant="body" weight="700" tone={delta >= 0 ? 'good' : 'bad'}>
                      {delta >= 0 ? '+' : ''}
                      {formatQty(delta)}
                    </Text>
                    {branches.length > 1 && branch ? <Badge label={branch.code} tone="neutral" size="sm" /> : null}
                  </View>
                </Pressable>
              );
            })
          )}
        </Card>
        {pages.isFetchingNextPage ? <MoreRowsSkeleton kind="list" /> : null}
      </ScrollView>
    </View>
  );
}
