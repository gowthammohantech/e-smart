import React from 'react';
import { ActivityIndicator, Pressable, StyleProp, View, ViewStyle , Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

type Props = {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  iconRight?: keyof typeof MaterialCommunityIcons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  haptic?: boolean;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  disabled,
  loading,
  fullWidth,
  style,
  haptic = true,
}: Props) {
  const t = useTheme();

  const heights: Record<ButtonSize, number> = { sm: 36, md: 46, lg: 54 };
  const fonts: Record<ButtonSize, number> = { sm: t.fontSize.small, md: t.fontSize.body, lg: t.fontSize.title };

  const palette: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: t.c.primary, fg: t.c.onPrimary, border: t.c.primary },
    secondary: { bg: t.c.chip, fg: t.c.primary, border: 'transparent' },
    ghost: { bg: 'transparent', fg: t.c.text, border: t.c.line },
    danger: { bg: t.c.badSoft, fg: t.c.bad, border: 'transparent' },
    success: { bg: t.c.goodSoft, fg: t.c.good, border: 'transparent' },
  };
  const p = palette[variant];
  const isDisabled = disabled || loading;

  const handlePress = () => {
    if (isDisabled) return;
    if (haptic && Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onPress?.();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      accessibilityLabel={title}
      onPress={handlePress}
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          height: heights[size],
          borderRadius: t.radius.md,
          backgroundColor: p.bg,
          borderWidth: variant === 'ghost' ? 1 : 0,
          borderColor: p.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: size === 'sm' ? t.spacing.md : t.spacing.xl,
          opacity: isDisabled ? 0.45 : pressed ? 0.8 : 1,
          alignSelf: fullWidth ? 'stretch' : 'auto',
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} size="small" />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon ? <MaterialCommunityIcons name={icon} size={fonts[size] + 3} color={p.fg} /> : null}
          <Text style={{ color: p.fg, fontSize: fonts[size], fontWeight: '600' }}>{title}</Text>
          {iconRight ? <MaterialCommunityIcons name={iconRight} size={fonts[size] + 3} color={p.fg} /> : null}
        </View>
      )}
    </Pressable>
  );
}
