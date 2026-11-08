import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Icon } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { TextField } from '@esmart/ui/components/Field';
import { EmptyState, SkeletonList } from '@esmart/ui/components/EmptyState';
import { Illustration } from '@esmart/ui/components/Illustration';
import { useItemPages } from '../../../remote/queries';
import { useDebounced } from '../../../components/useDebounced';
import { unitShortName } from '@esmart/core/data/masters';
import type { Item } from '@esmart/core/types';
import { formatMoney, formatQty } from '@esmart/core/lib/format';

/**
 * Barcode entry by hand: type or paste the code, or pick one of the items
 * that carry a barcode. Camera scanning is still to come (docs/PRODUCTION_READINESS.md).
 */
export default function ScanBarcode() {
  const t = useTheme();
  const { t: tr } = useTranslation(['inventory', 'nav']);
  const router = useRouter();

  const [code, setCode] = useState('');

  // Samples from the first page of items; the code typed is looked up on the server, exactly.
  const firstPage = useItemPages({}).rows as unknown as (Item & { stockOnHand?: number })[];
  const withBarcodes = firstPage.filter((i) => i.barcode);
  // Looked up once typing pauses, not on every keystroke.
  const lookup = useDebounced(code.trim());
  const foundPages = useItemPages({ barcode: lookup }, !!lookup);
  const found = foundPages.rows as unknown as (Item & { stockOnHand?: number })[];
  // Typing ahead of the lookup, or the lookup on its way: no "No item" yet.
  const searching = !!code.trim() && (lookup !== code.trim() || foundPages.isFetching);
  const match = code.trim() && !searching ? found[0] : undefined;
  const stock: Record<string, number> = match ? { [match.id]: match.stockOnHand ?? 0 } : {};

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.scanBarcode') }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.lg }} keyboardShouldPersistTaps="handled">
        <Card
          style={{
            alignItems: 'center',
            gap: t.spacing.md,
            paddingVertical: t.spacing.xxxl,
            borderStyle: 'dashed',
            borderWidth: 1,
            borderColor: t.c.line,
          }}
          variant="flat"
        >
          <Illustration name="scanning" size="full" />
          {/* No camera yet: say what this screen does, not "point the camera". */}
          <Text variant="body" weight="600">{tr('inventory:scan.lookUp')}</Text>
          <Text variant="caption" tone="muted" center style={{ maxWidth: 260, lineHeight: 18 }}>{tr('inventory:scan.manualNote')}</Text>
        </Card>

        <TextField label={tr('inventory:scan.barcode')} value={code} onChangeText={setCode} placeholder={tr('inventory:scan.barcodePlaceholder')} icon="barcode" autoFocus />

        {code.trim().length > 0 ? (
          searching ? (
            <Card padded={false}>
              <SkeletonList rows={1} />
            </Card>
          ) : match ? (
            <Card
              onPress={() => router.push(`/(app)/catalog/items/${match.id}`)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}
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
                <Text variant="body" weight="600">
                  {match.name}
                </Text>
                <Text variant="caption" tone="muted">
                  {formatMoney(match.salePrice)} · {tr('inventory:scan.inStock', { qty: formatQty(stock[match.id] ?? 0), unit: unitShortName(match.unit) || match.unit })}
                </Text>
              </View>
              <Icon name="chevron-right" size={18} color={t.c.muted} />
            </Card>
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

        {withBarcodes.length > 0 ? (
        <>
        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{tr('inventory:scan.yourBarcodes')}</Text>
        <Card padded={false}>
          {withBarcodes.slice(0, 8).map((i, idx) => (
            <Pressable
              key={i.id}
              onPress={() => setCode(i.barcode ?? '')}
              accessibilityRole="button"
              accessibilityLabel={tr('inventory:scan.a11yUse', { name: i.name })}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing.md,
                padding: t.spacing.lg,
                borderBottomWidth: idx < Math.min(withBarcodes.length, 8) - 1 ? 0.5 : 0,
                borderBottomColor: t.c.line,
                backgroundColor: pressed ? t.c.card2 : 'transparent',
              })}
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
        </Card>
        </>
        ) : null}
      </ScrollView>
    </View>
  );
}
