import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Icon } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { TextField } from '@esmart/ui/components/Field';
import { EmptyState, SkeletonList } from '@esmart/ui/components/EmptyState';
import { SkeletonGroup, SkeletonRows } from '@esmart/ui/components/Skeleton';
import { useDebounced } from '@esmart/app/components/useDebounced';
import { Illustration } from '@esmart/ui/components/Illustration';
import { useItemPages } from '@esmart/app/remote/queries';
import type { Item } from '@esmart/core/types';
import { formatMoney, formatQty } from '@esmart/core/lib/format';
import { Panel, TwoColumns } from './parts';

/**
 * Barcode lookup for a desktop: the scanner and the code box with its result
 * on the left, the sample codes to try on the right. Same behaviour as the
 * phone screen (`@esmart/app/screens/(app)/inventory/scan`).
 */
export function ScanBarcodeDesktop() {
  const t = useTheme();
  const { t: tr } = useTranslation(['inventory', 'nav']);
  const router = useRouter();

  const [code, setCode] = useState('');

  // Samples from the first page of items; the code typed is looked up on the server, exactly.
  const firstPages = useItemPages({});
  const firstPage = firstPages.rows as unknown as (Item & { stockOnHand?: number })[];
  const withBarcodes = firstPage.filter((i) => i.barcode);
  // Looked up once typing pauses, not on every keystroke.
  const lookup = useDebounced(code.trim());
  const foundPages = useItemPages({ barcode: lookup }, !!lookup);
  const found = foundPages.rows as unknown as (Item & { stockOnHand?: number })[];
  // Typing ahead of the lookup, or the lookup on its way: no "No item" and no old code's match yet.
  const searching = !!code.trim() && (lookup !== code.trim() || foundPages.isFetching);
  const match = code.trim() && !searching ? found[0] : undefined;
  const stock: Record<string, number> = match ? { [match.id]: match.stockOnHand ?? 0 } : {};

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.scanBarcode') }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 48, gap: t.spacing.lg }} keyboardShouldPersistTaps="handled">
        <TwoColumns
          main={
            <>
              <Card
                variant="flat"
                style={{
                  alignItems: 'center',
                  gap: t.spacing.md,
                  paddingVertical: t.spacing.xxl,
                  borderStyle: 'dashed',
                  borderWidth: 1,
                  borderColor: t.c.line,
                }}
              >
                <Illustration name="scanning" height={150} />
                <Text weight="600">{tr('inventory:scan.pointCamera')}</Text>
                <Text variant="caption" tone="muted" center style={{ maxWidth: 380, lineHeight: 18 }}>
                  {tr('inventory:scan.manualNote')}
                </Text>
              </Card>

              <Panel title={tr('inventory:scan.lookUp')} subtitle={tr('inventory:scan.lookUpHint')} icon="barcode-scan">
                <TextField
                  label={tr('inventory:scan.barcode')}
                  value={code}
                  onChangeText={setCode}
                  placeholder={tr('inventory:scan.barcodePlaceholder')}
                  icon="barcode"
                  autoFocus
                />
                {code.trim().length > 0 ? (
                  searching ? (
                    <Card variant="flat" padded={false}>
                      <SkeletonList rows={1} />
                    </Card>
                  ) : match ? (
                    <Pressable
                      onPress={() => router.push(`/(app)/catalog/items/${match.id}`)}
                      accessibilityRole="link"
                      accessibilityLabel={match.name}
                      style={(state) => {
                        const { hovered, focused } = state as WebPressState;
                        return [
                          {
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: t.spacing.md,
                            padding: t.spacing.lg,
                            borderRadius: t.radius.md,
                            backgroundColor: hovered ? t.c.goodSoft : t.c.card2,
                          },
                          focusRing(t, focused),
                        ];
                      }}
                    >
                      <View
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: t.radius.sm,
                          backgroundColor: t.c.goodSoft,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Icon name="check" size={22} color={t.c.good} />
                      </View>
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text weight="600">{match.name}</Text>
                        <Text variant="caption" tone="muted">
                          {formatMoney(match.salePrice)} · {tr('inventory:scan.inStock', { qty: formatQty(stock[match.id] ?? 0), unit: match.unit })}
                        </Text>
                      </View>
                      <Icon name="chevron-right" size={20} color={t.c.muted} />
                    </Pressable>
                  ) : (
                    <Card variant="flat">
                      <EmptyState
                        illustration="search-empty"
                        icon="barcode-off"
                        title={tr('inventory:scan.noItem')}
                        message={tr('inventory:scan.noItemBody')}
                        actionLabel={tr('inventory:scan.createItem')}
                        onAction={() => router.push('/(app)/catalog/items/new')}
                        compact
                      />
                    </Card>
                  )
                ) : null}
              </Panel>
            </>
          }
          side={
            <Panel title={tr('inventory:scan.tryOne')} subtitle={tr('inventory:scan.samplesHint')} icon="format-list-bulleted">
              <View style={{ marginHorizontal: -t.spacing.xl, marginBottom: -t.spacing.lg }}>
                {/* Samples still loading: placeholder rows, not an empty panel. */}
                {firstPages.isPending ? (
                  <SkeletonGroup style={{ paddingHorizontal: t.spacing.sm }}>
                    <SkeletonRows rows={4} icon={false} />
                  </SkeletonGroup>
                ) : null}
                {withBarcodes.slice(0, 8).map((i, idx, arr) => (
                  <Pressable
                    key={i.id}
                    onPress={() => setCode(i.barcode ?? '')}
                    accessibilityRole="button"
                    accessibilityLabel={tr('inventory:scan.a11yUse', { name: i.name })}
                    style={(state) => {
                      const { hovered, focused } = state as WebPressState;
                      return [
                        {
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: t.spacing.md,
                          paddingVertical: t.spacing.md,
                          paddingHorizontal: t.spacing.xl,
                          borderTopWidth: 1,
                          borderTopColor: t.c.line,
                          borderBottomWidth: idx === arr.length - 1 ? 0 : 0,
                          backgroundColor: hovered ? t.c.card2 : 'transparent',
                        },
                        focusRing(t, focused),
                      ];
                    }}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="small" weight="600" numberOfLines={1}>
                        {i.name}
                      </Text>
                      <Text variant="micro" tone="muted">
                        {i.barcode}
                      </Text>
                    </View>
                    <Badge label={tr('inventory:scan.use')} tone="info" size="sm" />
                  </Pressable>
                ))}
              </View>
            </Panel>
          }
        />
      </ScrollView>
    </View>
  );
}
