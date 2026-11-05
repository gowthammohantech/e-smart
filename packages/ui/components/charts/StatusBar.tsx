import React from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../Text';
import type { Money } from '@esmart/core/lib/money';
import { formatCompactMoney, formatMoney } from '@esmart/core/lib/format';

export type StatusSegment = { key: string; label: string; count: number; total: Money; color: string; onPress?: () => void };

/**
 * A part-to-whole bar: one stacked bar sized by amount, and a legend under it naming each part with
 * its count and amount. Tapping a legend row follows it (the invoices in that status).
 */
export function StatusBar({ segments, emptyLabel }: { segments: StatusSegment[]; emptyLabel: string }) {
  const t = useTheme();
  const whole = segments.reduce((a, s) => a + Math.max(0, s.total.minor), 0);
  if (!segments.length || whole === 0) {
    return (
      <Text variant="small" tone="muted">
        {emptyLabel}
      </Text>
    );
  }
  return (
    <View style={{ gap: t.spacing.md }}>
      <View style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2, backgroundColor: t.c.card2 }}>
        {segments.map((s) =>
          s.total.minor > 0 ? <View key={s.key} style={{ flex: s.total.minor / whole, backgroundColor: s.color }} /> : null,
        )}
      </View>
      <View style={{ gap: 2 }}>
        {segments.map((s) => (
          <Pressable
            key={s.key}
            onPress={s.onPress}
            disabled={!s.onPress}
            accessibilityRole={s.onPress ? 'button' : undefined}
            accessibilityLabel={`${s.label}: ${s.count}, ${formatMoney(s.total)}`}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, paddingVertical: 5, opacity: pressed ? 0.7 : 1 })}
          >
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: s.color }} />
            <Text variant="small" style={{ flex: 1 }} numberOfLines={1}>
              {s.label}
            </Text>
            <Text variant="caption" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
              {s.count}
            </Text>
            <Text variant="small" weight="600" style={{ minWidth: 72, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
              {formatCompactMoney(s.total)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
