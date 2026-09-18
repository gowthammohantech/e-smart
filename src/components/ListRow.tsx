import React from 'react';
import { Pressable, StyleProp, View, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

type Props = {
  title: string;
  subtitle?: string;
  meta?: string;
  right?: React.ReactNode;
  left?: React.ReactNode;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  iconColor?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  chevron?: boolean;
  divider?: boolean;
  style?: StyleProp<ViewStyle>;
  destructive?: boolean;
  disabled?: boolean;
};

export function ListRow({
  title,
  subtitle,
  meta,
  right,
  left,
  icon,
  iconColor,
  onPress,
  onLongPress,
  chevron,
  divider = true,
  style,
  destructive,
  disabled,
}: Props) {
  const t = useTheme();

  const content = (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.md,
          paddingVertical: t.spacing.md,
          paddingHorizontal: t.spacing.lg,
          minHeight: 56,
          borderBottomWidth: divider ? StyleSheetHairline : 0,
          borderBottomColor: t.c.line,
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      {left}
      {!left && icon ? (
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: t.radius.sm,
            backgroundColor: `${iconColor ?? t.c.primary}1F`,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MaterialCommunityIcons name={icon} size={19} color={iconColor ?? t.c.primary} />
        </View>
      ) : null}

      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" weight="600" numberOfLines={1} tone={destructive ? 'bad' : 'default'}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" tone="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {meta ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>

      {right}
      {chevron ? <MaterialCommunityIcons name="chevron-right" size={20} color={t.c.muted} /> : null}
    </View>
  );

  if (!onPress && !onLongPress) return content;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      style={({ pressed }) => (pressed ? { backgroundColor: t.c.card2 } : null)}
    >
      {content}
    </Pressable>
  );
}

const StyleSheetHairline = 0.5;
