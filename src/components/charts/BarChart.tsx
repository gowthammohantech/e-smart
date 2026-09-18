import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Money } from '@/lib/money';
import { formatCompactMoney, formatMoney } from '@/lib/format';

export type BarDatum = { label: string; value: Money; highlight?: boolean };

/**
 * Single-series magnitude-over-time bars. One series, so no legend box — the
 * caption names it. Tapping a bar is the mobile stand-in for hover and reveals
 * the exact value; the tallest bar stays directly labelled so the chart reads
 * without interaction.
 */
export function BarChart({
  data,
  height = 150,
  caption,
  color,
}: {
  data: BarDatum[];
  height?: number;
  caption?: string;
  color?: string;
}) {
  const t = useTheme();
  const [selected, setSelected] = useState<number | null>(null);
  const barColor = color ?? t.c.primary;

  if (data.length === 0) {
    return (
      <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
        <Text variant="small" tone="muted">
          No data for this period
        </Text>
      </View>
    );
  }

  const max = Math.max(...data.map((d) => Math.abs(d.value.minor)), 1);
  const peakIndex = data.reduce((best, d, i) => (Math.abs(d.value.minor) > Math.abs(data[best].value.minor) ? i : best), 0);
  const active = selected ?? peakIndex;
  const plotHeight = height - 26;

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: t.spacing.sm }}>
        {caption ? (
          <Text variant="caption" tone="muted">
            {caption}
          </Text>
        ) : (
          <View />
        )}
        <Text variant="small" weight="700">
          {formatMoney(data[active].value)}
          <Text variant="caption" tone="muted">
            {`  ${data[active].label}`}
          </Text>
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: plotHeight }}>
        {data.map((d, i) => {
          const ratio = Math.abs(d.value.minor) / max;
          const barHeight = Math.max(3, ratio * (plotHeight - 4));
          const isActive = i === active;
          return (
            <Pressable
              key={`${d.label}-${i}`}
              onPress={() => setSelected(i === selected ? null : i)}
              accessibilityRole="button"
              accessibilityLabel={`${d.label}: ${formatMoney(d.value)}`}
              style={{ flex: 1, height: plotHeight, justifyContent: 'flex-end' }}
            >
              <Svg width="100%" height={plotHeight}>
                <Rect
                  x="0"
                  y={plotHeight - barHeight}
                  width="100%"
                  height={barHeight}
                  rx={4}
                  ry={4}
                  fill={isActive ? barColor : `${barColor}66`}
                />
              </Svg>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', gap: 2, marginTop: 6 }}>
        {data.map((d, i) => (
          <View key={`${d.label}-lbl-${i}`} style={{ flex: 1, alignItems: 'center' }}>
            <Text variant="micro" tone={i === active ? 'default' : 'muted'} numberOfLines={1}>
              {d.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Horizontal magnitude bars for ranked categories, with direct value labels. */
export function RankedBars({
  rows,
  max,
  colorFor,
  emptyLabel = 'Nothing to show yet',
}: {
  rows: { label: string; value: Money; sublabel?: string }[];
  max?: number;
  colorFor?: (index: number) => string;
  emptyLabel?: string;
}) {
  const t = useTheme();
  if (rows.length === 0) {
    return (
      <Text variant="small" tone="muted">
        {emptyLabel}
      </Text>
    );
  }
  const peak = max ?? Math.max(...rows.map((r) => Math.abs(r.value.minor)), 1);

  return (
    <View style={{ gap: t.spacing.md }}>
      {rows.map((r, i) => {
        const pct = Math.max(2, (Math.abs(r.value.minor) / peak) * 100);
        const color = colorFor ? colorFor(i) : t.c.primary;
        return (
          <View key={`${r.label}-${i}`} style={{ gap: 5 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.spacing.md }}>
              <Text variant="small" numberOfLines={1} style={{ flex: 1 }}>
                {r.label}
              </Text>
              <Text variant="small" weight="600">
                {formatCompactMoney(r.value)}
              </Text>
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: t.c.card2, overflow: 'hidden' }}>
              <View style={{ width: `${pct}%`, height: '100%', borderRadius: 3, backgroundColor: color }} />
            </View>
            {r.sublabel ? (
              <Text variant="micro" tone="muted">
                {r.sublabel}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** Compact trend line for a stat tile. */
export function Sparkline({
  values,
  width = 92,
  height = 30,
  color,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  const t = useTheme();
  const stroke = color ?? t.c.primary;
  if (values.length < 2) return <View style={{ width, height }} />;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);

  const points = values.map((v, i) => ({
    x: i * step,
    y: height - 2 - ((v - min) / span) * (height - 4),
  }));

  return (
    <Svg width={width} height={height}>
      {points.slice(1).map((p, i) => (
        <Line
          key={i}
          x1={points[i].x}
          y1={points[i].y}
          x2={p.x}
          y2={p.y}
          stroke={stroke}
          strokeWidth={2}
          strokeLinecap="round"
        />
      ))}
    </Svg>
  );
}
