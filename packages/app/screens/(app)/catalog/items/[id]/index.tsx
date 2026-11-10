import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Icon } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { StatRow, StatTile } from '@esmart/ui/components/StatTile';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { Sheet } from '@esmart/ui/components/Sheet';
import { useServerSave } from '../../../../../components/useServerSave';
import { useAppStore } from '../../../../../store/appStore';
import {
  useBaseCurrency,
  useDocuments,
  useHasModule,
  useItem,
  useStockMovements,
  useTaxCategories,
} from '../../../../../store/selectors';
import { useItemLedger, useItemRecord } from '../../../../../remote/queries';
import { LoadingView } from '../../../../../components/LoadingView';
import { CardRowsSkeleton } from '../../../../../components/ScreenSkeleton';
import { isLowStock, ledgerFor, signedQuantity, stockOnHand, stockValue } from '@esmart/core/domain/stockLedger';
import type { Money } from '@esmart/core/lib/money';
import { formatMoney, formatPercent, formatQty } from '@esmart/core/lib/format';
import { formatDate } from '@esmart/core/lib/date';
import { multiply } from '@esmart/core/lib/money';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { SplitPane } from '@esmart/ui/components/Layout';
import { Menu, MenuItem, useMenuAnchor } from '@esmart/ui/components/Menu';
import { Cell, DataTable } from '@esmart/ui/components/DataTable';
import { useGoBack } from '../../../../../navigation/useGoBack';

export default function ItemDetail() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const desktop = useIsDesktop();
  const { t: tr } = useTranslation(['common', 'inventory', 'nav', 'books']);
  const router = useRouter();
  const goBack = useGoBack();
  const { run: serverSave } = useServerSave();

  const { id } = useLocalSearchParams<{ id: string }>();
  const item = useItem(id);
  // Fetched on opening, so it shows even when the book on the device doesn't hold it.
  const remote = useItemRecord(id);
  const baseCurrency = useBaseCurrency();
  // The item's own id: the route's may be the one it had before the server saved it.
  const movements = useStockMovements(item?.id ?? id, { branchScoped: true });
  const hasInventory = useHasModule('inventory');
  const hasPurchases = useHasModule('purchases');
  const taxCategories = useTaxCategories();
  const invoices = useDocuments('invoice');
  const removeItem = useAppStore((s) => s.removeItem);

  const [actionsOpen, setActionsOpen] = useState(false);
  // On a desktop the actions drop down from their header button instead of a sheet.
  const { setAnchor, rect: actionsRect, open: openActionsMenu, close: closeActionsMenu } = useMenuAnchor();
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Stock, value, quantity sold and the movements come from the server. Until it answers they
  // show as placeholders: the device only holds recent movements, so its sums read as wrong
  // figures (0 in stock, nothing sold). The device's figures stand in only if the server fails.
  const activeBranchId = useAppStore((s) => s.activeBranchId) || undefined;
  const ledgerEnabled = hasInventory && !!item?.trackInventory;
  const ledgerQ = useItemLedger(item?.id, activeBranchId, ledgerEnabled);
  const server = ledgerQ.data;
  const ledgerPending = ledgerEnabled && ledgerQ.isPending;
  const deviceLedger = useMemo(() => (item ? ledgerFor(item.id, movements).reverse() : []), [item, movements]);
  const ledger = (server?.rows as typeof deviceLedger | undefined) ?? deviceLedger;

  const soldQty = useMemo(() => {
    if (!item) return 0;
    return invoices
      .filter((d) => !['draft', 'cancelled'].includes(d.status))
      .flatMap((d) => d.lines)
      .filter((l) => l.itemId === item.id)
      .reduce((a, l) => a + l.quantity, 0);
  }, [invoices, item]);

  if (!item && remote.isLoading) return <LoadingView />;
  if (!item) {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ title: tr('nav:title.item') }} />
        <EmptyState illustration="not-found" icon="package-variant-closed-remove" title={tr('common:notFound.title')} message={tr('common:notFound.item')} />
      </View>
    );
  }

  const onHand = server?.onHand ?? stockOnHand(item.id, movements);
  const value = (server?.value as Money | undefined) ?? stockValue(item, movements, baseCurrency);
  const low = server?.low ?? isLowStock(item, onHand);
  const category = taxCategories.find((c) => c.id === item.taxCategoryId);
  // The share of the sale price that's profit, as the item form shows it.
  const hasMargin = item.salePrice.minor > 0 && item.purchasePrice.minor > 0;
  const margin = hasMargin ? ((item.salePrice.minor - item.purchasePrice.minor) / item.salePrice.minor) * 100 : 0;

  const headerCard = (
    <>
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
          <Icon
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
            <Badge label={tr(`inventory:type.${item.type}`)} tone="neutral" size="sm" />
            {/* No category on the item: no rate, rather than a 0% it may not be. */}
            {category ? <Badge label={formatPercent(category.rate)} tone="info" size="sm" /> : null}
            {item.hsnCode ? <Badge label={`HSN ${item.hsnCode}`} tone="neutral" size="sm" /> : null}
            {item.status === 'inactive' ? <Badge label={tr('inventory:detail.inactive')} tone="warning" size="sm" /> : null}
          </View>
        </View>
      </View>
      {item.description ? (
        <Text variant="small" tone="muted" style={{ lineHeight: 20 }}>
          {item.description}
        </Text>
      ) : null}
    </Card>
    </>
  );
  const statBlock = (
    <>
    <View style={{ height: t.spacing.md }} />

    <StatRow>
      <StatTile label={tr('inventory:detail.salePrice')} value={item.salePrice} icon="tag-outline" caption={tr('inventory:detail.perUnit', { unit: item.unit })} />
      <StatTile
        label={tr('inventory:detail.margin')}
        // One decimal, like the item form.
        value={hasMargin ? formatPercent(Math.round(margin * 10) / 10) : '—'}
        tone={margin > 0 ? 'good' : 'default'}
        icon="trending-up"
        caption={tr('inventory:detail.cost', { amount: formatMoney(item.purchasePrice) })}
      />
    </StatRow>

    {item.trackInventory && hasInventory ? (
      <>
        <View style={{ height: t.spacing.md }} />
        <StatRow>
          <StatTile
            label={tr('inventory:detail.inStock')}
            value={`${formatQty(onHand)} ${item.unit}`}
            tone={onHand <= 0 ? 'bad' : low ? 'warn' : 'good'}
            loading={ledgerPending}
            icon="warehouse"
            caption={item.reorderLevel > 0 ? tr('inventory:detail.reorderAt', { qty: formatQty(item.reorderLevel) }) : undefined}
          />
          <StatTile label={tr('inventory:detail.stockValue')} value={value} loading={ledgerPending} icon="cash" caption={tr('inventory:detail.soldAllTime', { qty: formatQty(server?.soldQuantity ?? soldQty) })} />
        </StatRow>
      </>
    ) : null}
    </>
  );
  const pricingAcross = desktop && !(item.trackInventory && hasInventory);
  const pricingBlock = (
    <>
    <Text variant="caption" tone="muted" weight="600" style={{ marginTop: t.spacing.xl, marginBottom: t.spacing.sm, textTransform: 'uppercase', letterSpacing: 0.8 }}>{tr('inventory:detail.pricing')}</Text>
    {/* In a desktop's wide main column the prices are equal cells across the card, not a label and value a page apart. */}
    <Card style={pricingAcross ? { flexDirection: 'row', flexWrap: 'wrap', columnGap: t.spacing.xxl, rowGap: t.spacing.md } : { gap: t.spacing.md }}>
      {[
        { label: tr('inventory:detail.salePrice'), value: `${formatMoney(item.salePrice)} / ${item.unit}` },
        { label: tr('inventory:form.purchasePrice'), value: `${formatMoney(item.purchasePrice)} / ${item.unit}` },
        { label: tr('inventory:detail.taxCategory'), value: category?.name ?? '—' },
        {
          label: tr('inventory:detail.salePriceInclTax'),
          value: formatMoney(multiply(item.salePrice, 1 + (category?.rate ?? 0) / 100)),
        },
      ].map((r) => (
        <View key={r.label} style={pricingAcross ? { flex: 1, minWidth: 140, gap: 2 } : { flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant={pricingAcross ? 'caption' : 'small'} tone="muted">
            {r.label}
          </Text>
          <Text variant="small" weight="600">
            {r.value}
          </Text>
        </View>
      ))}
    </Card>
    </>
  );
  const movementsBlock = (
    <>
    {item.trackInventory && hasInventory ? (
      <>
        <Text variant="caption" tone="muted" weight="600" style={{ marginTop: t.spacing.xl, marginBottom: t.spacing.sm, textTransform: 'uppercase', letterSpacing: 0.8 }}>{tr('inventory:detail.stockMovements')}</Text>
        {desktop && (ledgerPending || ledger.length) ? (
          // A desktop reads the movements as a ledger: date, type, reference, the change and the balance after it.
          <DataTable
            scroll={false}
            loading={ledgerPending}
            rows={ledgerPending ? [] : ledger.slice(0, 20)}
            rowKey={(row) => row.movement.id}
            columns={[
              { key: 'date', header: tr('common:table.date'), width: 130, render: (row) => <Cell tone="muted">{formatDate(row.movement.date)}</Cell> },
              { key: 'type', header: tr('common:table.type'), flex: 1, render: (row) => <Cell weight="600">{tr(`inventory:movementType.${row.movement.type}`)}</Cell> },
              {
                key: 'reference',
                header: tr('common:table.reference'),
                flex: 1.4,
                render: (row) => <Cell tone="muted">{[row.movement.referenceNumber, row.movement.notes].filter(Boolean).join(' · ') || '—'}</Cell>,
              },
              {
                key: 'change',
                header: tr('common:component.quantity'),
                width: 120,
                align: 'right',
                render: (row) => {
                  const delta = signedQuantity(row.movement);
                  return (
                    <Cell weight="700" tone={delta >= 0 ? 'good' : 'bad'} mono>
                      {`${delta >= 0 ? '+' : ''}${formatQty(delta)}`}
                    </Cell>
                  );
                },
              },
              { key: 'balance', header: tr('books:accounts.balance'), width: 120, align: 'right', render: (row) => <Cell mono>{formatQty(row.balance)}</Cell> },
            ]}
          />
        ) : (
        <Card padded={false}>
          {ledgerPending ? (
            <CardRowsSkeleton rows={5} kind="list" />
          ) : ledger.length === 0 ? (
            <EmptyState illustration="no-movements" icon="swap-vertical" title={tr('inventory:detail.noMovements')} compact />
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
                  <Icon
                    name={delta >= 0 ? 'arrow-down-bold-circle-outline' : 'arrow-up-bold-circle-outline'}
                    size={21}
                    color={delta >= 0 ? t.c.good : t.c.bad}
                  />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="body" weight="600">
                      {tr(`inventory:movementType.${row.movement.type}`)}
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
                      {tr('inventory:detail.balance', { qty: formatQty(row.balance) })}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </Card>
        )}
      </>
    ) : null}
    </>
  );

  const actions = [
    ...(item.trackInventory && hasInventory
      ? [
          { label: tr('inventory:detail.adjustStock'), icon: 'tune' as const, onPress: () => router.push(`/(app)/inventory/adjust?itemId=${item.id}`) },
          { label: tr('inventory:detail.transferBranches'), icon: 'swap-horizontal' as const, onPress: () => router.push(`/(app)/inventory/transfer?itemId=${item.id}`) },
        ]
      : []),
    { label: tr('inventory:detail.sellItem'), icon: 'file-document-edit-outline' as const, onPress: () => router.push(`/(app)/sales/invoices/new?itemId=${item.id}`) },
    ...(hasPurchases
      ? [{ label: tr('inventory:detail.buyItem'), icon: 'cart-outline' as const, onPress: () => router.push(`/(app)/purchases/bills/new?itemId=${item.id}`) }]
      : []),
    { label: tr('inventory:detail.deleteItem'), icon: 'trash-can-outline' as const, destructive: true, onPress: () => { setActionsOpen(false); setConfirmDelete(true); } },
  ];

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: item.name,
          ...(desktop
            ? {
                headerRight: () => (
                  <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
                    <View ref={setAnchor} collapsable={false}>
                      <Button title={tr('inventory:detail.actions')} variant="ghost" icon="dots-horizontal" onPress={openActionsMenu} />
                    </View>
                    <Button title={tr('inventory:detail.edit')} icon="pencil-outline" onPress={() => router.push(`/(app)/catalog/items/${item.id}/edit`)} />
                  </View>
                ),
              }
            : null),
        }}
      />

      <ScrollView
        contentContainerStyle={desktop ? { paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.xxxl } : { padding: t.spacing.lg, paddingBottom: 140 + insets.bottom }}
        showsVerticalScrollIndicator={SHOW_SCROLLBAR}
      >
        {desktop ? (
          <SplitPane
            sideWidth={360}
            side={
              <>
                {headerCard}
                {statBlock}
                {item.trackInventory && hasInventory ? pricingBlock : null}
              </>
            }
            // An untracked item's main column holds only its prices, across the column like the movements would be.
            main={item.trackInventory && hasInventory ? movementsBlock : pricingBlock}
          />
        ) : (
          <>
            {headerCard}
            {statBlock}
            {pricingBlock}
            {movementsBlock}
          </>
        )}
      </ScrollView>

      {desktop ? null : (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: t.spacing.lg,
            paddingBottom: insets.bottom + t.spacing.md,
            borderTopWidth: 1,
            borderTopColor: t.c.line,
            backgroundColor: t.c.paper,
            flexDirection: 'row',
            gap: t.spacing.md,
          }}
        >
          <Button title={tr('inventory:detail.edit')} icon="pencil-outline" onPress={() => router.push(`/(app)/catalog/items/${item.id}/edit`)} style={{ flex: 1 }} />
          <Button title={tr('inventory:detail.actions')} variant="ghost" icon="dots-horizontal" onPress={() => setActionsOpen(true)} style={{ flex: 1 }} />
        </View>
      )}

      <Menu anchor={actionsRect} onClose={closeActionsMenu} align="right" width={240}>
        {actions.map((a) => (
          <MenuItem
            key={a.label}
            icon={a.icon}
            label={a.label}
            destructive={a.destructive}
            onPress={() => {
              closeActionsMenu();
              a.onPress();
            }}
          />
        ))}
      </Menu>
      <Sheet visible={actionsOpen} onClose={() => setActionsOpen(false)} title={item.name}>
        {actions.map((a) => (
          <Pressable
            key={a.label}
            // Every action closes the sheet first; it is a modal, so one left open
            // would sit over the screen the action navigates to.
            onPress={() => {
              setActionsOpen(false);
              a.onPress();
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
            <Icon name={a.icon} size={20} color={t.c.text} />
            <Text variant="body" style={{ flex: 1 }}>
              {a.label}
            </Text>
          </Pressable>
        ))}
      </Sheet>

      <ConfirmDialog
        visible={confirmDelete}
        title={tr('inventory:detail.deleteTitle', { name: item.name })}
        message={tr('inventory:detail.deleteMessage')}
        confirmLabel={tr('inventory:detail.delete')}
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void serverSave(() => removeItem(item.id), tr('inventory:detail.deleted'), { icon: 'tag-remove-outline' }).then((res) => {
            if (res) goBack('/(app)/catalog/items');
          });
        }}
      />
    </View>
  );
}
