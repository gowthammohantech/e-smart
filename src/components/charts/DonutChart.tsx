import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Money, zero } from '@/lib/money';
import { formatCompactMoney, formatMoney } from '@/lib/format';
import { seriesColor } from '@/theme/chartColors';

export type DonutSlice = { label: string; value: Money };

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number, thickness: number): string {
  const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const outer = r;
  const inner = r - thickness;
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  const x1 = cx + outer * Math.cos(rad(startAngle));
  const y1 = cy + outer * Math.sin(rad(startAngle));
  const x2 = cx + outer * Math.cos(rad(endAngle));
  const y2 = cy + outer * Math.sin(rad(endAngle));
  const x3 = cx + inner * Math.cos(rad(endAngle));
  const y3 = cy + inner * Math.sin(rad(endAngle));
  const x4 = cx + inner * Math.cos(rad(startAngle));
  const y4 = cy + inner * Math.sin(rad(startAngle));

  return [
    `M ${x1} ${y1}`,
    `A ${outer} ${outer} 0 ${largeArc} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${inner} ${inner} 0 ${largeArc} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ');
}

/**
 * Composition of a whole. Slices take categorical slots in fixed order;
 * anything past the palette folds into a single "Other" slice rather than
 * generating new hues. A legend is always present, so identity is never
 * carried by colour alone.
 */
export function DonutChart({
  slices,
  size = 148,
  thickness = 22,
  centerLabel,
  maxSlices = 6,
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  maxSlices?: number;
}) {
  const t = useTheme();
  const [selected, setSelected] = useState<number | null>(null);

  const sorted = slices.filter((s) => s.value.minor > 0).sort((a, b) => b.value.minor - a.value.minor);
  const currency = sorted[0]?.value.currency ?? 'INR';

  const shown: DonutSlice[] =
    sorted.length > maxSlices
      ? [
          ...sorted.slice(0, maxSlices - 1),
          {
            label: 'Other',
            value: {
              minor: sorted.slice(maxSlices - 1).reduce((a, s) => a + s.value.minor, 0),
              currency,
            },
          },
        ]
      : sorted;

  const total = shown.reduce((a, s) => a + s.value.minor, 0);

  if (total <= 0) {
    return (
      <View style={{ height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Text variant="small" tone="muted">
          No data for this period
        </Text>
      </View>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 2;
  // A 2px surface gap keeps adjacent fills from touching.
  const gapDeg = shown.length > 1 ? 1.6 : 0;

  let cursor = 0;
  const arcs = shown.map((s, i) => {
    const sweep = (s.value.minor / total) * 360;
    const start = cursor + gapDeg / 2;
    const end = cursor + sweep - gapDeg / 2;
    cursor += sweep;
    return { slice: s, start, end: Math.max(start + 0.4, end), index: i };
  });

  const active = selected != null ? shown[selected] : null;
  const activePct = active ? Math.round((active.value.minor / total) * 100) : 100;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.lg }}>
      <View>
        <Svg width={size} height={size}>
          <G>
            {arcs.map((a) => (
              <Path
                key={a.index}
                d={arcPath(cx, cy, radius, a.start, a.end, thickness)}
                fill={seriesColor(t.scheme, a.index)}
                opacity={selected == null || selected === a.index ? 1 : 0.35}
              />
            ))}
            <Circle cx={cx} cy={cy} r={radius - thickness - 1} fill={t.c.card} />
          </G>
        </Svg>
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          pointerEvents="none"
        >
          <Text variant="title" weight="700">
            {active ? `${activePct}%` : formatCompactMoney({ minor: total, currency })}
          </Text>
          <Text variant="micro" tone="muted" numberOfLines={1}>
            {active ? active.label : (centerLabel ?? 'Total')}
          </Text>
        </View>
      </View>

      <View style={{ flex: 1, gap: 7 }}>
        {shown.map((s, i) => {
          const pct = Math.round((s.value.minor / total) * 100);
          return (
            <Pressable
              key={`${s.label}-${i}`}
              onPress={() => setSelected(selected === i ? null : i)}
              accessibilityRole="button"
              accessibilityState={{ selected: selected === i }}
              accessibilityLabel={`${s.label}: ${formatMoney(s.value)}, ${pct} percent`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}
            >
              <View
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 2,
                  backgroundColor: seriesColor(t.scheme, i),
                  opacity: selected == null || selected === i ? 1 : 0.35,
                }}
              />
              <Text variant="caption" style={{ flex: 1 }} numberOfLines={1}>
                {s.label}
              </Text>
              <Text variant="caption" tone="muted" weight="600">
                {pct}%
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function emptyMoney(currency: string): Money {
  return zero(currency);
}
