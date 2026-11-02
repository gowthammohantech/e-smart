import React from 'react';
import { ActivityIndicator, Pressable, StyleProp, View, ViewStyle , Platform } from 'react-native';
import { Icon, type IconName } from './Icon';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeProvider';
import { focusRing, type WebPressState } from '../theme/interaction';
import { useIsDesktop } from '../theme/breakpoints';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

type Props = {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
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

  const desktop = useIsDesktop();
  // Phone sizes suit a thumb; a desktop pointer needs less, so buttons there
  // take web proportions.
  const heights: Record<ButtonSize, number> = desktop ? { sm: 32, md: 36, lg: 40 } : { sm: 36, md: 46, lg: 54 };
  const fonts: Record<ButtonSize, number> = desktop
    ? { sm: t.fontSize.caption + 1, md: t.fontSize.small + 1, lg: t.fontSize.body }
    : { sm: t.fontSize.small, md: t.fontSize.body, lg: t.fontSize.title };
  const WEB = Platform.OS === 'web';

  const palette: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: t.c.primary, fg: t.c.onPrimary, border: t.c.primary },
    secondary: { bg: t.c.chip, fg: t.c.primary, border: 'transparent' },
    ghost: { bg: 'transparent', fg: t.c.text, border: t.c.line },
    danger: { bg: t.c.badSoft, fg: t.c.bad, border: 'transparent' },
    success: { bg: t.c.goodSoft, fg: t.c.good, border: 'transparent' },
  };
  const p = palette[variant];
  const isDisabled = disabled || loading;

  // The browser draws hover and press as colour, the way web buttons do; a
  // phone has no hover and keeps its opacity dip on press.
  const webFill = (pressed?: boolean, hovered?: boolean): string => {
    if (variant === 'primary') return pressed ? t.c.primaryPressed : hovered ? t.c.primaryHover : t.c.primary;
    if (variant === 'ghost') return pressed || hovered ? t.c.card2 : t.c.card;
    if (!pressed && !hovered) return p.bg;
    if (variant === 'secondary') return t.scheme === 'dark' ? 'rgba(59,139,255,0.22)' : 'rgba(10,108,240,0.14)';
    return p.bg;
  };

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
      style={(state) => {
        const { pressed, hovered, focused } = state as WebPressState;
        return [
        {
          height: heights[size],
          borderRadius: t.radius.md,
          backgroundColor: WEB ? webFill(pressed, hovered) : p.bg,
          borderWidth: variant === 'ghost' ? 1 : 0,
          borderColor: WEB && variant === 'ghost' ? (hovered ? t.c.lineStrong : t.c.line) : p.border,
          ...(WEB && (variant === 'primary' || variant === 'ghost') && !isDisabled ? t.shadow.card : null),
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: size === 'sm' ? t.spacing.md : t.spacing.xl,
          opacity: isDisabled ? 0.45 : WEB ? (pressed && variant !== 'primary' && variant !== 'ghost' ? 0.85 : 1) : pressed ? 0.8 : hovered ? 0.9 : 1,
          alignSelf: fullWidth ? 'stretch' : 'auto',
        },
        focusRing(t, focused),
        style,
      ];
      }}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} size="small" />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
          {icon ? <Icon name={icon} size={WEB ? 16 : fonts[size] + 3} color={p.fg} /> : null}
          {/* The height is fixed, so a label that wrapped would spill out of
              it; Tamil runs long, so shrink a little and then truncate. */}
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            style={{ color: p.fg, fontSize: fonts[size], fontWeight: WEB ? '500' : '600', flexShrink: 1 }}
          >
            {title}
          </Text>
          {iconRight ? <Icon name={iconRight} size={WEB ? 16 : fonts[size] + 3} color={p.fg} /> : null}
        </View>
      )}
    </Pressable>
  );
}
