import React from 'react';
import { View } from 'react-native';
import { Icon } from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

/**
 * Change against the period before: an arrow and the percentage, green when it went the good way.
 * `inverse` is for a cost, where up is bad. No previous figure to compare with shows a dash.
 */
export function DeltaBadge({ pct, inverse, accessibilityLabel }: { pct: number | null | undefined; inverse?: boolean; accessibilityLabel?: string }) {
  const t = useTheme();
  if (pct === undefined) return null;
  if (pct === null || !Number.isFinite(pct)) {
    return (
      <Text variant="micro" tone="muted" accessibilityLabel={accessibilityLabel}>
        —
      </Text>
    );
  }
  const up = pct > 0;
  const flat = pct === 0;
  const good = flat ? null : up !== !!inverse;
  const color = good === null ? t.c.muted : good ? t.c.good : t.c.bad;
  return (
    <View accessibilityLabel={accessibilityLabel} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      {flat ? null : <Icon name={up ? 'arrow-up' : 'arrow-down'} size={11} color={color} />}
      <Text variant="micro" weight="600" style={{ color, fontVariant: ['tabular-nums'] }}>
        {`${Math.abs(pct).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`}
      </Text>
    </View>
  );
}
