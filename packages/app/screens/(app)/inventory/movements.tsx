import React, { useMemo, useState, useCallback} from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Icon } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { SearchBar } from '@esmart/ui/components/SearchBar';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { useBranches, useItems, useStockMovements } from '../../../store/selectors';
import { useQueryParams } from '../../../navigation/queryParams';
import { signedQuantity } from '@esmart/core/domain/stockLedger';
import { StockMovementType } from '@esmart/core/types';
import { formatQty } from '@esmart/core/lib/format';
import { formatDate } from '@esmart/core/lib/date';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';

const TYPES: (StockMovementType | 'all')[] = ['all', 'purchaseReceipt', 'salesIssue', 'adjustment', 'transferIn', 'transferOut', 'salesReturn', 'purchaseReturn', 'opening'];

export default function StockMovements() {
  const t = useTheme();
  const { t: tr } = useTranslation(['inventory', 'nav']);
  const router = useRouter();

  const movements = useStockMovements();
  const items = useItems();
  const branches = useBranches();

  const [query, setQuery] = useState('');
  // The type filter lives in the URL (`?type=sale`); search stays local.
  const [params, setParams] = useQueryParams();
  const type = (params.type ?? 'all') as StockMovementType | 'all';
  const setType = (ty: StockMovementType | 'all') => setParams({ type: ty === 'all' ? undefined : ty });

  const nameOf = useCallback((id: string) => items.find((i) => i.id === id), [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return movements
      .filter((m) => {
        if (type !== 'all' && m.type !== type) return false;
        if (!q) return true;
        const item = nameOf(m.itemId);
        return `${item?.name ?? ''} ${item?.sku ?? ''} ${m.referenceNumber ?? ''} ${m.notes ?? ''}`.toLowerCase().includes(q);
      })
      .sort((a, b) => (b.date === a.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)));
  }, [movements, query, type, nameOf]);

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
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

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Card padded={false}>
          {filtered.length === 0 ? (
            <EmptyState illustration="no-movements" icon="swap-vertical" title={tr('inventory:movements.none')} message={tr('inventory:movements.noneBody')} compact />
          ) : (
            filtered.slice(0, 200).map((m, i) => {
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
                    borderBottomWidth: i < Math.min(filtered.length, 200) - 1 ? 0.5 : 0,
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
      </ScrollView>
    </View>
  );
}
