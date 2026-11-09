import React from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { focusRing, type WebPressState } from '../theme/interaction';
import { Text, TextTone } from './Text';
import { Money } from '@esmart/core/lib/money';
import { formatCompactMoney } from '@esmart/core/lib/format';
import { Sparkline } from './charts/BarChart';
import { DeltaBadge } from './DeltaBadge';
import { Skeleton } from './Skeleton';
import { STAT_TILE_MAX_WIDTH, useIsDesktop } from '../theme/breakpoints';

const WEB = Platform.OS === 'web';

export function StatTile({
  label,
  value,
  caption,
  tone = 'default',
  icon,
  onPress,
  trend,
  delta,
  flex = 1,
  loading,
}: {
  label: string;
  value: Money | string;
  caption?: string;
  tone?: TextTone;
  icon?: IconName;
  onPress?: () => void;
  trend?: number[];
  /** Change against the period before, in percent (null: nothing to compare with). `inverse` for a cost. */
  delta?: { pct: number | null; inverse?: boolean; label?: string };
  flex?: number;
  /** The figure is still on its way: the label stays, the value shimmers. */
  loading?: boolean;
}) {
  const t = useTheme();
  // One or two tiles on a desktop stay tile-sized instead of half the page each.
  const cap = useIsDesktop() ? STAT_TILE_MAX_WIDTH : undefined;
  const display = typeof value === 'string' ? value : formatCompactMoney(value);

  const toneColor =
    tone === 'good' ? t.c.good : tone === 'bad' ? t.c.bad : tone === 'warn' ? t.c.warn : t.c.text;

  const body = (
    <View
      style={{
        flex,
        maxWidth: cap,
        backgroundColor: t.c.card,
        borderRadius: t.radius.lg,
        borderWidth: WEB || t.scheme === 'dark' ? 1 : 0,
        borderColor: t.c.line,
        padding: t.spacing.lg,
        gap: WEB ? t.spacing.sm : 6,
        minHeight: 96,
        // A borderless light tile needs its shadow to show where it ends.
        ...t.shadow.card,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: WEB ? t.spacing.sm : 6 }}>
        {icon && !WEB ? <Icon name={icon} size={13} color={t.c.muted} /> : null}
        <Text variant="caption" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </Text>
        {icon && WEB ? (
          // On the web the icon sits in a small tinted square, top right.
          <View style={{ width: 28, height: 28, borderRadius: t.radius.md, backgroundColor: t.c.chip, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={icon} size={16} color={t.c.primary} />
          </View>
        ) : null}
      </View>

      {loading ? (
        <Skeleton height={WEB ? 28 : 22} width="70%" radius={6} />
      ) : (
        <Text
          variant={WEB ? 'h2' : 'h3'}
          weight={WEB ? '600' : '700'}
          numberOfLines={1}
          style={WEB ? { color: toneColor, fontVariant: ['tabular-nums'] } : { color: toneColor }}
        >
          {display}
        </Text>
      )}

      {/* The footer sits at the tile's foot; with nothing in it the value stays under the label rather than dropping. */}
      {caption || (delta && !loading) || (!loading && trend && trend.length > 1) ? (
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 'auto' }}>
        {loading && caption ? (
          // A caption is often worked out from the figure ("0% margin"), so it waits with it.
          <View style={{ flex: 1 }}>
            <Skeleton height={9} width="50%" radius={4} />
          </View>
        ) : caption ? (
          <Text variant="micro" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
            {caption}
          </Text>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {delta && !loading ? <DeltaBadge pct={delta.pct} inverse={delta.inverse} accessibilityLabel={delta.label} /> : null}
        {!loading && trend && trend.length > 1 ? <Sparkline values={trend} width={54} height={20} color={toneColor} /> : null}
      </View>
      ) : null}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${display}`}
      style={(state) => {
        const { pressed, hovered, focused } = state as WebPressState;
        return [{ flex, maxWidth: cap, borderRadius: t.radius.lg, opacity: pressed ? 0.75 : hovered ? 0.88 : 1 }, focusRing(t, focused)];
      }}
    >
      {body}
    </Pressable>
  );
}

export function StatRow({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <View style={{ flexDirection: 'row', gap: t.spacing.md }}>{children}</View>;
}
