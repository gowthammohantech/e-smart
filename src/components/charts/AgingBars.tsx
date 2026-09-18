import React from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Money } from '@/lib/money';
import { formatCompactMoney, formatMoney } from '@/lib/format';
import { sequentialRamp } from '@/theme/chartColors';

export type AgingDatum = { key: string; label: string; amount: Money; count: number };

/**
 * Aging buckets are ordered severity, not identity, so they take a single-hue
 * sequential ramp (light -> dark as the debt gets older) rather than
 * categorical colours.
 */
export function AgingBars({
  buckets,
  onSelect,
  selectedKey,
}: {
  buckets: AgingDatum[];
  onSelect?: (key: string) => void;
  selectedKey?: string | null;
}) {
  const t = useTheme();
  const ramp = sequentialRamp(t.scheme);
  const max = Math.max(...buckets.map((b) => b.amount.minor), 1);
  const total = buckets.reduce((a, b) => a + b.amount.minor, 0);

  return (
    <View style={{ gap: t.spacing.md }}>
      <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 }}>
        {buckets.map((b, i) => {
          const pct = total > 0 ? (b.amount.minor / total) * 100 : 0;
          if (pct <= 0) return null;
          return (
            <View
              key={b.key}
              style={{
                width: `${pct}%`,
                backgroundColor: ramp[Math.min(i, ramp.length - 1)],
                opacity: selectedKey && selectedKey !== b.key ? 0.35 : 1,
              }}
            />
          );
        })}
      </View>

      <View style={{ gap: t.spacing.sm }}>
        {buckets.map((b, i) => {
          const pct = Math.max(1.5, (b.amount.minor / max) * 100);
          const dim = !!selectedKey && selectedKey !== b.key;
          return (
            <Pressable
              key={b.key}
              onPress={onSelect ? () => onSelect(b.key) : undefined}
              accessibilityRole={onSelect ? 'button' : undefined}
              accessibilityLabel={`${b.label} days: ${formatMoney(b.amount)} across ${b.count} invoices`}
              style={{ gap: 5, opacity: dim ? 0.5 : 1 }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="caption" tone="muted">
                  {b.label}
                  {b.count > 0 ? `  ·  ${b.count}` : ''}
                </Text>
                <Text variant="caption" weight="600">
                  {formatCompactMoney(b.amount)}
                </Text>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: t.c.card2, overflow: 'hidden' }}>
                <View
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    borderRadius: 3,
                    backgroundColor: ramp[Math.min(i, ramp.length - 1)],
                  }}
                />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
