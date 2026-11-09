import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Icon } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { PrimaryActionBar } from '@esmart/ui/components/ActionBar';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { StatRow, StatTile } from '@esmart/ui/components/StatTile';
import { useBaseCurrency } from '../../../store/selectors';
import { useAppStore } from '../../../store/appStore';
import { keep, useServerReport } from '../../../remote/queries';
import { today } from '@esmart/core/lib/date';
import type { Item } from '@esmart/core/types';
import { formatMoney, formatQty } from '@esmart/core/lib/format';
import { multiply } from '@esmart/core/lib/money';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { Cell, DataTable } from '@esmart/ui/components/DataTable';
import { CardRowsSkeleton } from '../../../components/ScreenSkeleton';
import { unitShortName } from '@esmart/core/data/masters';
import { LoadFailed } from '../../../features/company/LoadFailed';

export default function LowStock() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation(['inventory', 'nav', 'common']);
  const router = useRouter();
  const desktop = useIsDesktop();

  const baseCurrency = useBaseCurrency();
  const companyId = useAppStore((s) => s.activeCompanyId);
  const branchId = useAppStore((s) => s.activeBranchId) || undefined;

  // The server's stock report: every tracked item with what's on hand and whether it is low.
  const day = today();
  const reportQuery = useServerReport<{ rows?: { item: Item; onHand: number; low: boolean }[]; outCount?: number }>('stock', { from: day, to: day, branchId });
  const report = reportQuery.data;
  // Until the first answer, no "all stocked" and no zero tiles: shapes where they'll be.
  const failed = !report && reportQuery.isError;
  const loading = !report && !failed;
  const rows = useMemo(
    () => (report?.rows ?? []).filter((r) => r.low && r.item.status === 'active').sort((a, b) => a.onHand - b.onHand),
    [report],
  );
  // A purchase order raised from here starts with these items, which the editor looks up in the store.
  useEffect(() => {
    if (rows.length) keep('item', companyId, rows.map((r) => r.item as never));
  }, [rows, companyId]);

  const suggestedValue = rows.reduce((acc, r) => {
    const shortfall = Math.max(0, r.item.reorderLevel * 2 - r.onHand);
    return acc + r.item.purchasePrice.minor * shortfall;
  }, 0);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.lowStock') }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: desktop ? t.spacing.xxl : 120 + insets.bottom }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        {failed ? (
          <Card padded={false}>
            <LoadFailed onRetry={reportQuery.refetch} />
          </Card>
        ) : (
        <>
        <StatRow>
          <StatTile label={tr('inventory:lowStock.needAttention')} value={String(rows.length)} tone="warn" icon="alert-outline" caption={tr('inventory:hub.outOfStock', { count: report?.outCount ?? 0 })} loading={loading} />
          <StatTile
            label={tr('inventory:lowStock.restockCost')}
            value={{ minor: suggestedValue, currency: baseCurrency }}
            icon="cart-outline"
            caption={tr('inventory:lowStock.restockCaption')}
            loading={loading}
          />
        </StatRow>

        <View style={{ height: t.spacing.lg }} />

        {desktop && (loading || rows.length) ? (
          // A desktop reads the short items as a table: on hand against the reorder level, and what to buy.
          <DataTable
            scroll={false}
            loading={loading}
            rows={rows}
            rowKey={(r) => r.item.id}
            rowLabel={(r) => r.item.name}
            onRowPress={(r) => router.push(`/(app)/catalog/items/${r.item.id}`)}
            columns={[
              { key: 'name', header: tr('common:table.name'), flex: 2, render: (r) => <Cell weight="600">{r.item.name}</Cell> },
              { key: 'sku', header: tr('common:table.sku'), width: 140, render: (r) => <Cell tone="muted">{r.item.sku || '—'}</Cell> },
              {
                key: 'onHand',
                header: tr('common:table.onHand'),
                width: 120,
                align: 'right',
                render: (r) => (
                  <Cell weight="700" tone={r.onHand <= 0 ? 'bad' : 'warn'} mono>
                    {`${formatQty(r.onHand)} ${unitShortName(r.item.unit) || r.item.unit}`}
                  </Cell>
                ),
              },
              { key: 'reorder', header: tr('inventory:form.reorderLevel'), width: 140, align: 'right', render: (r) => <Cell tone="muted" mono>{formatQty(r.item.reorderLevel)}</Cell> },
              {
                key: 'restock',
                header: tr('inventory:lowStock.restockCost'),
                flex: 1.2,
                render: (r) => {
                  const shortfall = Math.max(0, r.item.reorderLevel * 2 - r.onHand);
                  return <Cell tone="muted">{tr('inventory:lowStock.buySuggestion', { qty: formatQty(shortfall), amount: formatMoney(multiply(r.item.purchasePrice, shortfall)) })}</Cell>;
                },
              },
              {
                key: 'status',
                header: tr('common:table.status'),
                width: 110,
                render: (r) => (r.onHand <= 0 ? <Badge label={tr('inventory:lowStock.out')} tone="danger" size="sm" /> : null),
              },
            ]}
          />
        ) : (
        <Card padded={false} style={desktop ? { maxWidth: 720 } : undefined}>
          {loading ? (
            <CardRowsSkeleton kind="list" rows={6} />
          ) : rows.length === 0 ? (
            <EmptyState illustration="all-settled" icon="check-all" title={tr('inventory:lowStock.allStocked')} message={tr('inventory:lowStock.allStockedBody')} compact />
          ) : (
            rows.map((r, i) => {
              const shortfall = Math.max(0, r.item.reorderLevel * 2 - r.onHand);
              return (
                <Pressable
                  key={r.item.id}
                  onPress={() => router.push(`/(app)/catalog/items/${r.item.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={tr('inventory:hub.a11yStock', { name: r.item.name, qty: formatQty(r.onHand) })}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: t.spacing.md,
                    padding: t.spacing.lg,
                    borderBottomWidth: i < rows.length - 1 ? 0.5 : 0,
                    borderBottomColor: t.c.line,
                    backgroundColor: pressed ? t.c.card2 : 'transparent',
                  })}
                >
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: t.radius.sm,
                      backgroundColor: r.onHand <= 0 ? t.c.badSoft : t.c.warnSoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon name="package-variant" size={19} color={r.onHand <= 0 ? t.c.bad : t.c.warn} />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text variant="body" weight="600" numberOfLines={1}>
                      {r.item.name}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {r.item.sku} · {tr('inventory:lowStock.reorderAt', { qty: formatQty(r.item.reorderLevel), unit: unitShortName(r.item.unit) || r.item.unit })}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text variant="body" weight="700" tone={r.onHand <= 0 ? 'bad' : 'warn'}>
                      {formatQty(r.onHand)}
                    </Text>
                    {r.onHand <= 0 ? (
                      <Badge label={tr('inventory:lowStock.out')} tone="danger" size="sm" />
                    ) : (
                      <Text variant="micro" tone="muted">
                        {tr('inventory:lowStock.buySuggestion', { qty: formatQty(shortfall), amount: formatMoney(multiply(r.item.purchasePrice, shortfall)) })}
                      </Text>
                    )}
                  </View>
                </Pressable>
              );
            })
          )}
        </Card>
        )}
        </>
        )}
      </ScrollView>

      {rows.length > 0 ? (
        <PrimaryActionBar
          title={tr('inventory:lowStock.raisePo')}
          icon="cart-plus"
          onPress={() => {
            // Each short item at what brings it back to twice its reorder level, as suggested above.
            const reorder = rows
              .map((r) => `${r.item.id}:${Math.max(0, r.item.reorderLevel * 2 - r.onHand)}`)
              .filter((pair) => !pair.endsWith(':0'));
            router.push(`/(app)/purchases/orders/new${reorder.length ? `?items=${encodeURIComponent(reorder.join(','))}` : ''}` as never);
          }}
        />
      ) : null}
    </View>
  );
}
