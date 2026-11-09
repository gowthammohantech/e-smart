import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { seriesColor } from '../../theme/chartColors';
import { useIsDesktop } from '../../theme/breakpoints';
import { Text } from '../Text';
import { subtract, type Money } from '@esmart/core/lib/money';
import { formatMoney } from '@esmart/core/lib/format';

export type PairedDatum = { label: string; inflow: Money; outflow: Money };

/** Each of a pair's bars at its widest on a desktop, so a few periods in a wide card don't turn into slabs. */
const MAX_PAIR_BAR_WIDTH = 24;

/**
 * Money in and out per period, side by side. The two series have a small legend that doubles as
 * the readout: tapping a period shows its in, out and net; the latest is shown until then.
 */
export function PairedBars({
  data,
  height = 150,
  inLabel,
  outLabel,
  netLabel,
  caption,
}: {
  data: PairedDatum[];
  height?: number;
  inLabel: string;
  outLabel: string;
  netLabel: string;
  caption?: string;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  const [selected, setSelected] = useState<number | null>(null);
  const desktop = useIsDesktop();
  const inColor = seriesColor(t.scheme, 0);
  const outColor = seriesColor(t.scheme, 1);

  if (data.length === 0) {
    return (
      <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
        <Text variant="small" tone="muted">{tr('common:component.noChartData')}</Text>
      </View>
    );
  }

  const max = Math.max(...data.flatMap((d) => [d.inflow.minor, d.outflow.minor]), 1);
  const active = selected ?? data.length - 1;
  const a = data[active];
  const net = subtract(a.inflow, a.outflow);
  const plot = height - 26;
  const dense = data.length > 14;

  const swatch = (color: string, label: string, value: Money) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />
      <Text variant="caption" tone="muted">{label}</Text>
      <Text variant="caption" weight="600" style={{ fontVariant: ['tabular-nums'] }}>{formatMoney(value)}</Text>
    </View>
  );

  return (
    <View>
      {caption ? (
        <Text variant="caption" tone="muted" style={{ marginBottom: 4 }}>
          {caption}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: t.spacing.md, rowGap: 4, marginBottom: t.spacing.sm }}>
        <Text variant="caption" weight="700">{a.label}</Text>
        {swatch(inColor, inLabel, a.inflow)}
        {swatch(outColor, outLabel, a.outflow)}
        <Text variant="caption" weight="700" tone={net.minor >= 0 ? 'good' : 'bad'}>
          {`${netLabel} ${formatMoney(net)}`}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: dense ? 1 : 4, height: plot }}>
        {data.map((d, i) => {
          const on = i === active;
          const bar = (m: Money, color: string) => (
            <View style={{ flex: 1, maxWidth: desktop ? MAX_PAIR_BAR_WIDTH : undefined, height: Math.max(2, (m.minor / max) * (plot - 4)), borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: on ? color : `${color}66` }} />
          );
          return (
            <Pressable
              key={`${d.label}-${i}`}
              onPress={() => setSelected(i === selected ? null : i)}
              accessibilityRole="button"
              accessibilityLabel={`${d.label}: ${inLabel} ${formatMoney(d.inflow)}, ${outLabel} ${formatMoney(d.outflow)}`}
              style={{ flex: 1, height: plot, flexDirection: 'row', alignItems: 'flex-end', justifyContent: desktop ? 'center' : undefined, gap: 1 }}
            >
              {bar(d.inflow, inColor)}
              {bar(d.outflow, outColor)}
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', gap: dense ? 1 : 4, marginTop: 6 }}>
        {data.map((d, i) => (
          <View key={`${d.label}-l-${i}`} style={{ flex: 1, alignItems: 'center' }}>
            {/* Every label on a short series; every few on a long one. */}
            {!dense || i % Math.ceil(data.length / 7) === 0 || i === active ? (
              <Text variant="micro" tone={i === active ? 'default' : 'muted'} numberOfLines={1}>
                {d.label}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}
