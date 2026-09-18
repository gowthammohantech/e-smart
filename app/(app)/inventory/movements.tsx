import React, { useMemo, useState, useCallback} from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { SearchBar } from '@/components/SearchBar';
import { EmptyState } from '@/components/EmptyState';
import { useBranches, useItems, useStockMovements } from '@/store/selectors';
import { MOVEMENT_LABELS, signedQuantity } from '@/domain/stockLedger';
import { StockMovementType } from '@/types';
import { formatQty } from '@/lib/format';
import { formatDate } from '@/lib/date';

const TYPES: (StockMovementType | 'all')[] = ['all', 'purchaseReceipt', 'salesIssue', 'adjustment', 'transferIn', 'transferOut', 'salesReturn', 'purchaseReturn', 'opening'];

export default function StockMovements() {
  const t = useTheme();
  const router = useRouter();

  const movements = useStockMovements();
  const items = useItems();
  const branches = useBranches();

  const [query, setQuery] = useState('');
  const [type, setType] = useState<StockMovementType | 'all'>('all');

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
      <Stack.Screen options={{ title: 'Stock movements' }} />

      <View style={{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, gap: t.spacing.md }}>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search by item or reference" />
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
                  {ty === 'all' ? 'All' : MOVEMENT_LABELS[ty]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Text variant="caption" tone="muted">
          {filtered.length} movements
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Card padded={false}>
          {filtered.length === 0 ? (
            <EmptyState icon="swap-vertical" title="No movements" message="Stock movements appear as you buy, sell and adjust." compact />
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
                  accessibilityLabel={`${item?.name ?? 'Item'}, ${MOVEMENT_LABELS[m.type]}, ${delta}`}
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
                  <MaterialCommunityIcons
                    name={delta >= 0 ? 'arrow-down-bold-circle-outline' : 'arrow-up-bold-circle-outline'}
                    size={21}
                    color={delta >= 0 ? t.c.good : t.c.bad}
                  />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text variant="body" weight="600" numberOfLines={1}>
                      {item?.name ?? 'Unknown item'}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {MOVEMENT_LABELS[m.type]} · {formatDate(m.date, 'dd MMM')}
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
