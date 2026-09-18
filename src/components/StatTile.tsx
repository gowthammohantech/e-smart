import React from 'react';
import { Pressable, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text, TextTone } from './Text';
import { Money } from '@/lib/money';
import { formatCompactMoney } from '@/lib/format';
import { Sparkline } from './charts/BarChart';

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
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
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
        borderWidth: t.scheme === 'dark' ? 1 : 0,
        borderColor: t.c.line,
        padding: t.spacing.lg,
        gap: 6,
        minHeight: 96,
        justifyContent: 'space-between',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon ? <MaterialCommunityIcons name={icon} size={13} color={t.c.muted} /> : null}
        <Text variant="caption" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </Text>
      </View>

      <Text variant="h3" weight="700" numberOfLines={1} style={{ color: toneColor }}>
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
      style={({ pressed }) => ({ flex, opacity: pressed ? 0.75 : 1 })}
    >
      {body}
    </Pressable>
  );
}

export function StatRow({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <View style={{ flexDirection: 'row', gap: t.spacing.md }}>{children}</View>;
}
