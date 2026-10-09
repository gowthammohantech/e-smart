import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { TextField } from '@esmart/ui/components/Field';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Illustration } from '@esmart/ui/components/Illustration';
import { useItems, useStockLevels } from '@esmart/app/store/selectors';
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

  const items = useItems();
  const stock = useStockLevels();
  const [code, setCode] = useState('');

  const withBarcodes = items.filter((i) => i.barcode);
  const match = items.find((i) => i.barcode === code.trim());

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
                  {tr('inventory:scan.prototypeNote')}
                </Text>
              </Card>

              <Panel title="Look up a code" subtitle="Type or paste it, or use a scanner that types for you" icon="barcode-scan">
                <TextField
                  label={tr('inventory:scan.barcode')}
                  value={code}
                  onChangeText={setCode}
                  placeholder={tr('inventory:scan.barcodePlaceholder')}
                  icon="barcode"
                  autoFocus
                />
                {code.trim().length > 0 ? (
                  match ? (
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
                        <MaterialCommunityIcons name="check" size={22} color={t.c.good} />
                      </View>
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text weight="600">{match.name}</Text>
                        <Text variant="caption" tone="muted">
                          {formatMoney(match.salePrice)} · {formatQty(stock[match.id] ?? 0)} {match.unit} in stock
                        </Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={20} color={t.c.muted} />
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
            <Panel title={tr('inventory:scan.tryOne')} subtitle="Sample barcodes from your items" icon="format-list-bulleted">
              <View style={{ marginHorizontal: -t.spacing.xl, marginBottom: -t.spacing.lg }}>
                {withBarcodes.slice(0, 8).map((i, idx, arr) => (
                  <Pressable
                    key={i.id}
                    onPress={() => setCode(i.barcode ?? '')}
                    accessibilityRole="button"
                    accessibilityLabel={`Use barcode for ${i.name}`}
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
