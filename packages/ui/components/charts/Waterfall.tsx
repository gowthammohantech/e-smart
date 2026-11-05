import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../Text';
import type { Money } from '@esmart/core/lib/money';
import { formatCompactMoney, formatMoney } from '@esmart/core/lib/format';

/**
 * One step of a waterfall: a `total` stands from zero (revenue, gross profit, net profit); a
 * `change` floats from the running total, adding (`value` positive) or taking away.
 */
export type WaterfallStep = { label: string; value: Money; kind: 'total' | 'change' };

/** Where each bar starts and ends on the running total: a total from zero, a change from the total so far. */
export function placeSteps(steps: WaterfallStep[]): (WaterfallStep & { start: number; end: number })[] {
  return steps.reduce<(WaterfallStep & { start: number; end: number })[]>((out, s) => {
    const running = out.length ? out[out.length - 1].end : 0;
    out.push(s.kind === 'total' ? { ...s, start: 0, end: s.value.minor } : { ...s, start: running, end: running + s.value.minor });
    return out;
  }, []);
}

/**
 * A horizontal waterfall: each step a row on one shared scale, so the bars read top to bottom as
 * the money flows. Totals in the brand colour, additions green, deductions red, each labelled with
 * its amount.
 */
export function Waterfall({ steps }: { steps: WaterfallStep[] }) {
  const t = useTheme();
  const bars = placeSteps(steps);
  const lo = Math.min(0, ...bars.flatMap((b) => [b.start, b.end]));
  const hi = Math.max(1, ...bars.flatMap((b) => [b.start, b.end]));
  const span = hi - lo || 1;
  const pct = (v: number) => ((v - lo) / span) * 100;

  return (
    <View style={{ gap: t.spacing.md }}>
      {bars.map((b, i) => {
        const from = pct(Math.min(b.start, b.end));
        const width = Math.max(0.8, pct(Math.max(b.start, b.end)) - from);
        const color = b.kind === 'total' ? (b.value.minor < 0 ? t.c.bad : t.c.primary) : b.value.minor >= 0 ? t.c.good : t.c.bad;
        return (
          <View key={`${b.label}-${i}`} style={{ gap: 4 }} accessibilityLabel={`${b.label}: ${formatMoney(b.value)}`}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.spacing.md }}>
              <Text variant="small" weight={b.kind === 'total' ? '600' : '400'} tone={b.kind === 'total' ? 'default' : 'muted'} numberOfLines={1} style={{ flex: 1 }}>
                {b.label}
              </Text>
              <Text variant="small" weight={b.kind === 'total' ? '700' : '500'} style={{ fontVariant: ['tabular-nums'], color: b.kind === 'total' ? t.c.text : color }}>
                {b.kind === 'change' && b.value.minor > 0 ? `+${formatCompactMoney(b.value)}` : formatCompactMoney(b.value)}
              </Text>
            </View>
            <View style={{ height: 10, borderRadius: 3, backgroundColor: t.c.card2 }}>
              <View style={{ position: 'absolute', left: `${from}%`, width: `${width}%`, top: 0, bottom: 0, borderRadius: 3, backgroundColor: color }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}
