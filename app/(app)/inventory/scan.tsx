import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { TextField } from '@/components/Field';
import { EmptyState } from '@/components/EmptyState';
import { useItems, useStockLevels } from '@/store/selectors';
import { formatMoney, formatQty } from '@/lib/format';

/**
 * Barcode entry. A real build opens the camera through expo-camera; the
 * prototype accepts a typed code and offers the seeded barcodes as shortcuts.
 */
export default function ScanBarcode() {
  const t = useTheme();
  const router = useRouter();

  const items = useItems();
  const stock = useStockLevels();
  const [code, setCode] = useState('');

  const withBarcodes = items.filter((i) => i.barcode);
  const match = items.find((i) => i.barcode === code.trim());

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: 'Scan barcode' }} />

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
          <MaterialCommunityIcons name="barcode-scan" size={44} color={t.c.primary} />
          <Text variant="body" weight="600">
            Point the camera at a barcode
          </Text>
          <Text variant="caption" tone="muted" center style={{ maxWidth: 260, lineHeight: 18 }}>
            Camera scanning runs on a real device. In this prototype you can type or pick a code below.
          </Text>
        </Card>

        <TextField label="Barcode" value={code} onChangeText={setCode} placeholder="Enter or paste a code" icon="barcode" autoFocus />

        {code.trim().length > 0 ? (
          match ? (
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
                <MaterialCommunityIcons name="check" size={22} color={t.c.good} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text variant="body" weight="600">
                  {match.name}
                </Text>
                <Text variant="caption" tone="muted">
                  {formatMoney(match.salePrice)} · {formatQty(stock[match.id] ?? 0)} {match.unit} in stock
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={t.c.muted} />
            </Card>
          ) : (
            <Card variant="flat">
              <EmptyState
                icon="barcode-off"
                title="No item with that code"
                message="Add the barcode to an existing item, or create a new one."
                actionLabel="Create item"
                onAction={() => router.push('/(app)/catalog/items/new')}
                compact
              />
            </Card>
          )
        ) : null}

        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
          Try one of these
        </Text>
        <Card padded={false}>
          {withBarcodes.slice(0, 8).map((i, idx) => (
            <Pressable
              key={i.id}
              onPress={() => setCode(i.barcode ?? '')}
              accessibilityRole="button"
              accessibilityLabel={`Use barcode for ${i.name}`}
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
              <Badge label="Use" tone="info" size="sm" />
            </Pressable>
          ))}
        </Card>
      </ScrollView>
    </View>
  );
}
