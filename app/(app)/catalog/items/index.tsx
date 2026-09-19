import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { Card } from '@/components/Card';
import { SearchBar } from '@/components/SearchBar';
import { ListRow } from '@/components/ListRow';
import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { Fab } from '@/components/Fab';
import { useItems } from '@/store/selectors';
import { formatMoney } from '@/lib/format';

/**
 * The price list: what you sell and for how much. The full plan reaches items
 * through Stock, with on-hand quantities; this is the Sales plan's way in.
 */
export default function ItemList() {
  const t = useTheme();
  const router = useRouter();
  const items = useItems();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((i) => `${i.name} ${i.sku} ${i.hsnCode ?? ''}`.toLowerCase().includes(q)) : items;
  }, [items, query]);

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: 'Items & services' }} />
      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120, gap: t.spacing.md }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search by name, SKU or HSN" />
        {filtered.length === 0 ? (
          <EmptyState
            illustration="no-items"
            title={items.length ? 'No match' : 'No items yet'}
            message={items.length ? 'No item matches that search.' : 'Add what you sell to put it on invoices in a tap.'}
            actionLabel={items.length ? undefined : 'Add item'}
            onAction={items.length ? undefined : () => router.push('/(app)/catalog/items/new')}
          />
        ) : (
          <Card padded={false}>
            {filtered.map((item, i) => (
              <ListRow
                key={item.id}
                title={item.name}
                subtitle={`${item.sku}${item.hsnCode ? ` · HSN ${item.hsnCode}` : ''}`}
                meta={`${formatMoney(item.salePrice)} / ${item.unit}`}
                right={item.type === 'service' ? <Badge label="Service" tone="neutral" size="sm" /> : undefined}
                divider={i < filtered.length - 1}
                onPress={() => router.push(`/(app)/catalog/items/${item.id}`)}
              />
            ))}
          </Card>
        )}
      </ScrollView>
      <Fab icon="plus" onPress={() => router.push('/(app)/catalog/items/new')} />
    </View>
  );
}
