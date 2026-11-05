import React from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../Text';
import { Money } from '@esmart/core/lib/money';
import { formatCompactMoney, formatMoney } from '@esmart/core/lib/format';
import { sequentialRamp } from '../../theme/chartColors';
import { Badge } from '../Badge';
import type { IconName } from '../Icon';
import type { StatusTone } from '@esmart/core/domain/documentStates';

/**
 * What each bucket asks of the person, with an icon so it doesn't rest on colour alone.
 * Keys not listed (a custom bucket) show no label.
 */
const URGENCY: Record<string, { tone: StatusTone; icon: IconName }> = {
  current: { tone: 'neutral', icon: 'check-circle-outline' },
  d1_30: { tone: 'warning', icon: 'bell-outline' },
  d31_60: { tone: 'warning', icon: 'alert-outline' },
  d61_90: { tone: 'danger', icon: 'alert-outline' },
  d90plus: { tone: 'danger', icon: 'alert-circle-outline' },
};

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
  const { t: tr } = useTranslation(['reports']);
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
          // The day ranges read the same in every language; "Current" does not.
          const label = b.key === 'current' ? tr('reports:cell.current') : b.label;
          const dim = !!selectedKey && selectedKey !== b.key;
          const urgency = URGENCY[b.key];
          const urgencyLabel = urgency ? tr(`reports:cell.urgency.${b.key}` as 'reports:cell.urgency.current') : '';
          return (
            <Pressable
              key={b.key}
              onPress={onSelect ? () => onSelect(b.key) : undefined}
              accessibilityRole={onSelect ? 'button' : undefined}
              accessibilityLabel={[tr('reports:cell.agingA11y', { label, amount: formatMoney(b.amount), count: b.count }), urgencyLabel].filter(Boolean).join('. ')}
              style={{ gap: 5, opacity: dim ? 0.5 : 1 }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text variant="caption" tone="muted">
                    {label}
                    {b.count > 0 ? `  ·  ${b.count}` : ''}
                  </Text>
                  {urgency && b.count > 0 ? <Badge label={urgencyLabel} tone={urgency.tone} icon={urgency.icon} size="sm" /> : null}
                </View>
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
