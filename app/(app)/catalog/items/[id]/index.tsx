import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { StatRow, StatTile } from '@/components/StatTile';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { useAppStore } from '@/store/appStore';
import { useBaseCurrency, useDocuments, useItem, useTaxCategories } from '@/store/selectors';
import { formatMoney, formatPercent, formatQty } from '@/lib/format';
import { money, multiply } from '@/lib/money';

export default function ItemDetail() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();

  const { id } = useLocalSearchParams<{ id: string }>();
  const item = useItem(id);
  const baseCurrency = useBaseCurrency();
  const taxCategories = useTaxCategories();
  const invoices = useDocuments('invoice');
  const removeItem = useAppStore((s) => s.removeItem);

  const [actionsOpen, setActionsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const sold = useMemo(() => {
    const lines = invoices
      .filter((d) => !['draft', 'cancelled'].includes(d.status))
      .flatMap((d) => d.lines)
      .filter((l) => l.itemId === item?.id);
    return {
      quantity: lines.reduce((a, l) => a + l.quantity, 0),
      value: money(
        lines.reduce((a, l) => a + Math.round(l.unitPrice.minor * l.quantity), 0),
        baseCurrency,
      ),
      invoices: new Set(
        invoices
          .filter((d) => !['draft', 'cancelled'].includes(d.status) && d.lines.some((l) => l.itemId === item?.id))
          .map((d) => d.id),
      ).size,
    };
  }, [invoices, item, baseCurrency]);

  if (!item) {
    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg }}>
        <Stack.Screen options={{ title: 'Item' }} />
        <EmptyState illustration="not-found" icon="package-variant-closed-remove" title="Not found" message="This item may have been deleted." />
      </View>
    );
  }

  const category = taxCategories.find((c) => c.id === item.taxCategoryId);
  const isGoods = item.type === 'goods';

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: item.name }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <Card style={{ gap: t.spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: t.radius.md,
                backgroundColor: isGoods ? t.c.chip : t.c.mutedSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MaterialCommunityIcons
                name={isGoods ? 'package-variant-closed' : 'hammer-wrench'}
                size={25}
                color={isGoods ? t.c.primary : t.c.muted}
              />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text variant="title" weight="700">
                {item.name}
              </Text>
              <Text variant="caption" tone="muted">
                {item.sku}
              </Text>
              <View style={{ flexDirection: 'row', gap: 5, marginTop: 3, flexWrap: 'wrap' }}>
                <Badge label={item.type === 'goods' ? 'Product' : 'Service'} tone="neutral" size="sm" />
                <Badge label={formatPercent(category?.rate ?? 0)} tone="info" size="sm" />
                {item.hsnCode ? (
                  <Badge label={`${isGoods ? 'HSN' : 'SAC'} ${item.hsnCode}`} tone="neutral" size="sm" />
                ) : (
                  <Badge label="No HSN" tone="danger" size="sm" />
                )}
                {item.status === 'inactive' ? <Badge label="Inactive" tone="warning" size="sm" /> : null}
              </View>
            </View>
          </View>
          {item.description ? (
            <Text variant="small" tone="muted" style={{ lineHeight: 20 }}>
              {item.description}
            </Text>
          ) : null}
        </Card>

        <View style={{ height: t.spacing.md }} />

        <StatRow>
          <StatTile label="Sale price" value={item.salePrice} icon="tag-outline" caption={`per ${item.unit}`} />
          <StatTile
            label="Sold"
            value={sold.value}
            icon="trending-up"
            caption={`${formatQty(sold.quantity)} ${item.unit} across ${sold.invoices} invoices`}
          />
        </StatRow>

        <Text variant="caption" tone="muted" weight="600" style={{ marginTop: t.spacing.xl, marginBottom: t.spacing.sm, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Pricing and tax
        </Text>
        <Card style={{ gap: t.spacing.md }}>
          {[
            { label: 'Sale price', value: `${formatMoney(item.salePrice)} / ${item.unit}` },
            { label: 'Tax category', value: category?.name ?? '—' },
            {
              label: 'Sale price incl. tax',
              value: formatMoney(multiply(item.salePrice, 1 + (category?.rate ?? 0) / 100)),
            },
            { label: isGoods ? 'HSN code' : 'SAC code', value: item.hsnCode ?? 'Not set — the IRP will reject it' },
            { label: 'Unit', value: item.unit },
          ].map((r) => (
            <View key={r.label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="small" tone="muted">
                {r.label}
              </Text>
              <Text variant="small" weight="600">
                {r.value}
              </Text>
            </View>
          ))}
        </Card>

      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: t.spacing.lg,
          paddingBottom: t.spacing.xl,
          borderTopWidth: 1,
          borderTopColor: t.c.line,
          backgroundColor: t.c.paper,
          flexDirection: 'row',
          gap: t.spacing.md,
        }}
      >
        <Button title="Edit" icon="pencil-outline" onPress={() => router.push(`/(app)/catalog/items/${item.id}/edit`)} style={{ flex: 1 }} />
        <Button title="Actions" variant="ghost" icon="dots-horizontal" onPress={() => setActionsOpen(true)} style={{ flex: 1 }} />
      </View>

      <Sheet visible={actionsOpen} onClose={() => setActionsOpen(false)} title={item.name}>
        {[
          { label: 'Sell this item', icon: 'file-document-edit-outline' as const, onPress: () => router.push('/(app)/sales/invoices/new' as never) },
          { label: 'Quote this item', icon: 'file-percent-outline' as const, onPress: () => router.push('/(app)/sales/quotes/new' as never) },
          { label: 'Delete item', icon: 'trash-can-outline' as const, onPress: () => { setActionsOpen(false); setConfirmDelete(true); } },
        ].map((a) => (
          <Pressable
            key={a.label}
            onPress={a.onPress}
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
            <MaterialCommunityIcons name={a.icon} size={20} color={t.c.text} />
            <Text variant="body" style={{ flex: 1 }}>
              {a.label}
            </Text>
          </Pressable>
        ))}
      </Sheet>

      <ConfirmDialog
        visible={confirmDelete}
        title={`Delete ${item.name}?`}
        message="Documents that already use this item keep their own copy of the details. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          removeItem(item.id);
          setConfirmDelete(false);
          toast.show('Item deleted', 'success');
          router.back();
        }}
      />
    </View>
  );
}
