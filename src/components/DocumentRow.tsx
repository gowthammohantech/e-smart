import React from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';
import { StatusBadge } from './Badge';
import { Avatar } from './Avatar';
import { BusinessDocument } from '@/types';
import { formatMoney } from '@/lib/format';
import { formatDate } from '@/lib/date';

export function DocumentRow({
  document,
  partyName,
  onPress,
  outstandingLabel,
  divider = true,
}: {
  document: BusinessDocument;
  partyName: string;
  onPress?: () => void;
  outstandingLabel?: string;
  divider?: boolean;
}) {
  const t = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${document.number}, ${partyName}, ${formatMoney(document.totals.grandTotal)}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.md,
        paddingVertical: t.spacing.md,
        paddingHorizontal: t.spacing.lg,
        borderBottomWidth: divider ? 0.5 : 0,
        borderBottomColor: t.c.line,
        backgroundColor: pressed ? t.c.card2 : 'transparent',
      })}
    >
      <Avatar name={partyName} size={38} />

      <View style={{ flex: 1, gap: 3 }}>
        <Text variant="body" weight="600" numberOfLines={1}>
          {partyName}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {document.number} · {formatDate(document.date, 'dd MMM')}
          {outstandingLabel ? ` · ${outstandingLabel}` : ''}
        </Text>
      </View>

      <View style={{ alignItems: 'flex-end', gap: 5 }}>
        <Text variant="body" weight="700" style={{ fontVariant: ['tabular-nums'] }}>
          {formatMoney(document.totals.grandTotal)}
        </Text>
        <StatusBadge status={document.status} size="sm" />
      </View>
    </Pressable>
  );
}
