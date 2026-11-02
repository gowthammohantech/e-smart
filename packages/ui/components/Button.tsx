import React from 'react';
import { ActivityIndicator, Pressable, StyleProp, View, ViewStyle , Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  iconRight?: keyof typeof MaterialCommunityIcons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  haptic?: boolean;
  /**
   * A key that runs it with Ctrl (⌘ on a Mac): a letter, e.g. "S" for a Save
   * the screen binds to Ctrl+S, or "Enter". Shown in a tooltip when the
   * button is hovered in a desktop browser; the screen does the listening
   * (useSaveShortcut).
   */
  shortcut?: string;
};

// A Mac's browser names the key ⌘; every other one, Ctrl.
const onMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

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
  shortcut,
}: Props) {
  const t = useTheme();

  const desktop = useIsDesktop();
  // Phone sizes suit a thumb; a desktop pointer needs less, so buttons there
  // take web proportions.
  const heights: Record<ButtonSize, number> = desktop ? { sm: 32, md: 40, lg: 44 } : { sm: 36, md: 46, lg: 54 };
  const fonts: Record<ButtonSize, number> = desktop
    ? { sm: t.fontSize.caption + 1, md: t.fontSize.small + 1, lg: t.fontSize.body }
    : { sm: t.fontSize.small, md: t.fontSize.body, lg: t.fontSize.title };

  const palette: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: t.c.primary, fg: t.c.onPrimary, border: t.c.primary },
    secondary: { bg: t.c.chip, fg: t.c.primary, border: 'transparent' },
    ghost: { bg: 'transparent', fg: t.c.text, border: t.c.line },
    danger: { bg: t.c.badSoft, fg: t.c.bad, border: 'transparent' },
    success: { bg: t.c.goodSoft, fg: t.c.good, border: 'transparent' },
  };
  const p = palette[variant];
  const isDisabled = disabled || loading;
  const keys = shortcut && desktop && Platform.OS === 'web' ? `${onMac ? '⌘' : 'Ctrl+'}${shortcut === 'Enter' ? 'Enter' : shortcut.toUpperCase()}` : null;

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
          backgroundColor: p.bg,
          borderWidth: variant === 'ghost' ? 1 : 0,
          borderColor: p.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: size === 'sm' ? t.spacing.md : t.spacing.xl,
          opacity: isDisabled ? 0.45 : pressed ? 0.8 : hovered ? 0.9 : 1,
          alignSelf: fullWidth ? 'stretch' : 'auto',
          // Its tooltip sits over whatever is next to it.
          zIndex: keys && hovered ? 10 : undefined,
        },
        focusRing(t, focused),
        style,
      ];
      }}
    >
      {(state) => (
        <>
          {loading ? (
            <ActivityIndicator color={p.fg} size="small" />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
              {icon ? <MaterialCommunityIcons name={icon} size={fonts[size] + 3} color={p.fg} /> : null}
              {/* The height is fixed, so a label that wrapped would spill out of
                  it; Tamil runs long, so shrink a little and then truncate. */}
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                style={{ color: p.fg, fontSize: fonts[size], fontWeight: '600', flexShrink: 1 }}
              >
                {title}
              </Text>
              {iconRight ? <MaterialCommunityIcons name={iconRight} size={fonts[size] + 3} color={p.fg} /> : null}
            </View>
          )}
          {/* The keyboard shortcut, in a tooltip above the button while it is hovered. */}
          {keys && (state as WebPressState).hovered && !isDisabled ? (
            <View pointerEvents="none" style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, alignItems: 'center', marginBottom: 6 }}>
              <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: t.c.text }}>
                <Text numberOfLines={1} style={{ color: t.c.bg, fontSize: 11, fontWeight: '600' }}>
                  {keys}
                </Text>
              </View>
            </View>
          ) : null}
        </>
      )}
    </Pressable>
  );
}
