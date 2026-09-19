import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import {
  useBaseCurrency,
  useDocuments,
  useHasModule,
  useItem,
  useStockMovements,
  useTaxCategories,
} from '@/store/selectors';
import { MOVEMENT_LABELS, isLowStock, ledgerFor, signedQuantity, stockOnHand, stockValue } from '@/domain/stockLedger';
import { formatMoney, formatPercent, formatQty } from '@/lib/format';
import { formatDate } from '@/lib/date';
import { multiply } from '@/lib/money';

export default function ItemDetail() {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'nav']);
  const router = useRouter();
  const toast = useToast();

  const { id } = useLocalSearchParams<{ id: string }>();
  const item = useItem(id);
  const baseCurrency = useBaseCurrency();
  const movements = useStockMovements(id);
  const hasInventory = useHasModule('inventory');
  const hasPurchases = useHasModule('purchases');
  const taxCategories = useTaxCategories();
  const invoices = useDocuments('invoice');
  const removeItem = useAppStore((s) => s.removeItem);

  const [actionsOpen, setActionsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const ledger = useMemo(() => (item ? ledgerFor(item.id, movements).reverse() : []), [item, movements]);

  const soldQty = useMemo(() => {
    if (!item) return 0;
    return invoices
      .filter((d) => !['draft', 'cancelled'].includes(d.status))
      .flatMap((d) => d.lines)
      .filter((l) => l.itemId === item.id)
      .reduce((a, l) => a + l.quantity, 0);
  }, [invoices, item]);

  if (!item) {
    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg }}>
        <Stack.Screen options={{ title: tr('nav:title.item') }} />
        <EmptyState illustration="not-found" icon="package-variant-closed-remove" title={tr('common:notFound.title')} message={tr('common:notFound.item')} />
      </View>
    );
  }

  const onHand = stockOnHand(item.id, movements);
  const value = stockValue(item, movements, baseCurrency);
  const low = isLowStock(item, onHand);
  const category = taxCategories.find((c) => c.id === item.taxCategoryId);
  const margin =
    item.purchasePrice.minor > 0
      ? ((item.salePrice.minor - item.purchasePrice.minor) / item.purchasePrice.minor) * 100
      : 0;

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
                backgroundColor: item.trackInventory ? t.c.chip : t.c.mutedSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MaterialCommunityIcons
                name={item.trackInventory ? 'package-variant-closed' : 'hammer-wrench'}
                size={25}
                color={item.trackInventory ? t.c.primary : t.c.muted}
              />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text variant="title" weight="700">
                {item.name}
              </Text>
              <Text variant="caption" tone="muted">
                {item.sku}
                {item.barcode ? ` · ${item.barcode}` : ''}
              </Text>
              <View style={{ flexDirection: 'row', gap: 5, marginTop: 3, flexWrap: 'wrap' }}>
                <Badge label={item.type === 'goods' ? 'Product' : 'Service'} tone="neutral" size="sm" />
                <Badge label={formatPercent(category?.rate ?? 0)} tone="info" size="sm" />
                {item.hsnCode ? <Badge label={`HSN ${item.hsnCode}`} tone="neutral" size="sm" /> : null}
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
            label="Margin"
            value={item.purchasePrice.minor > 0 ? formatPercent(margin) : '—'}
            tone={margin > 0 ? 'good' : 'default'}
            icon="trending-up"
            caption={`cost ${formatMoney(item.purchasePrice)}`}
          />
        </StatRow>

        {item.trackInventory && hasInventory ? (
          <>
            <View style={{ height: t.spacing.md }} />
            <StatRow>
              <StatTile
                label="In stock"
                value={`${formatQty(onHand)} ${item.unit}`}
                tone={onHand <= 0 ? 'bad' : low ? 'warn' : 'good'}
                icon="warehouse"
                caption={item.reorderLevel > 0 ? `reorder at ${formatQty(item.reorderLevel)}` : undefined}
              />
              <StatTile label="Stock value" value={value} icon="cash" caption={`${formatQty(soldQty)} sold all-time`} />
            </StatRow>
          </>
        ) : null}

        <Text variant="caption" tone="muted" weight="600" style={{ marginTop: t.spacing.xl, marginBottom: t.spacing.sm, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Pricing
        </Text>
        <Card style={{ gap: t.spacing.md }}>
          {[
            { label: 'Sale price', value: `${formatMoney(item.salePrice)} / ${item.unit}` },
            { label: 'Purchase price', value: `${formatMoney(item.purchasePrice)} / ${item.unit}` },
            { label: 'Tax category', value: category?.name ?? '—' },
            {
              label: 'Sale price incl. tax',
              value: formatMoney(multiply(item.salePrice, 1 + (category?.rate ?? 0) / 100)),
            },
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

        {item.trackInventory && hasInventory ? (
          <>
            <Text variant="caption" tone="muted" weight="600" style={{ marginTop: t.spacing.xl, marginBottom: t.spacing.sm, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Stock movements
            </Text>
            <Card padded={false}>
              {ledger.length === 0 ? (
                <EmptyState illustration="no-movements" icon="swap-vertical" title="No movements yet" compact />
              ) : (
                ledger.slice(0, 20).map((row, i) => {
                  const delta = signedQuantity(row.movement);
                  return (
                    <View
                      key={row.movement.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: t.spacing.md,
                        padding: t.spacing.lg,
                        borderBottomWidth: i < Math.min(ledger.length, 20) - 1 ? 0.5 : 0,
                        borderBottomColor: t.c.line,
                      }}
                    >
                      <MaterialCommunityIcons
                        name={delta >= 0 ? 'arrow-down-bold-circle-outline' : 'arrow-up-bold-circle-outline'}
                        size={21}
                        color={delta >= 0 ? t.c.good : t.c.bad}
                      />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text variant="body" weight="600">
                          {MOVEMENT_LABELS[row.movement.type]}
                        </Text>
                        <Text variant="caption" tone="muted" numberOfLines={1}>
                          {formatDate(row.movement.date)}
                          {row.movement.referenceNumber ? ` · ${row.movement.referenceNumber}` : ''}
                          {row.movement.notes ? ` · ${row.movement.notes}` : ''}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 2 }}>
                        <Text variant="body" weight="700" tone={delta >= 0 ? 'good' : 'bad'}>
                          {delta >= 0 ? '+' : ''}
                          {formatQty(delta)}
                        </Text>
                        <Text variant="micro" tone="muted">
                          bal {formatQty(row.balance)}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </Card>
          </>
        ) : null}
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
          ...(item.trackInventory && hasInventory
            ? [
                { label: 'Adjust stock', icon: 'tune' as const, onPress: () => router.push(`/(app)/inventory/adjust?itemId=${item.id}`) },
                { label: 'Transfer between branches', icon: 'swap-horizontal' as const, onPress: () => router.push(`/(app)/inventory/transfer?itemId=${item.id}`) },
              ]
            : []),
          { label: 'Sell this item', icon: 'file-document-edit-outline' as const, onPress: () => router.push('/(app)/sales/invoices/new') },
          ...(hasPurchases
            ? [{ label: 'Buy this item', icon: 'cart-outline' as const, onPress: () => router.push('/(app)/purchases/bills/new') }]
            : []),
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
