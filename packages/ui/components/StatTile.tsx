import React from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { focusRing, type WebPressState } from '../theme/interaction';
import { Text, TextTone } from './Text';
import { Money } from '@esmart/core/lib/money';
import { formatCompactMoney } from '@esmart/core/lib/format';
import { Sparkline } from './charts/BarChart';

const WEB = Platform.OS === 'web';

export function StatTile({
  label,
  value,
  caption,
  tone = 'default',
  icon,
  onPress,
  trend,
  flex = 1,
}: {
  label: string;
  value: Money | string;
  caption?: string;
  tone?: TextTone;
  icon?: IconName;
  onPress?: () => void;
  trend?: number[];
  flex?: number;
}) {
  const t = useTheme();
  const display = typeof value === 'string' ? value : formatCompactMoney(value);

  const toneColor =
    tone === 'good' ? t.c.good : tone === 'bad' ? t.c.bad : tone === 'warn' ? t.c.warn : t.c.text;

  const body = (
    <View
      style={{
        flex,
        backgroundColor: t.c.card,
        borderRadius: t.radius.lg,
        borderWidth: WEB || t.scheme === 'dark' ? 1 : 0,
        borderColor: t.c.line,
        padding: t.spacing.lg,
        gap: WEB ? t.spacing.sm : 6,
        minHeight: 96,
        justifyContent: 'space-between',
        ...(WEB ? t.shadow.card : null),
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

      <Text
        variant={WEB ? 'h2' : 'h3'}
        weight={WEB ? '600' : '700'}
        numberOfLines={1}
        style={WEB ? { color: toneColor, fontVariant: ['tabular-nums'] } : { color: toneColor }}
      >
        {display}
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        {caption ? (
          <Text variant="micro" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
            {caption}
          </Text>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {trend && trend.length > 1 ? <Sparkline values={trend} width={54} height={20} color={toneColor} /> : null}
      </View>
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
        return [{ flex, borderRadius: t.radius.lg, opacity: pressed ? 0.75 : hovered ? 0.88 : 1 }, focusRing(t, focused)];
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
