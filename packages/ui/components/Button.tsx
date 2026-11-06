import React, { useEffect, useRef, useState } from 'react';
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
  /**
   * When it returns a promise, the button is busy until it settles: further
   * presses are ignored and the spinner shows, so a double tap can't run it twice.
   */
  onPress?: () => unknown;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
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
  /** A line shown above the button while it is hovered in a desktop browser, e.g. why it is locked. */
  tooltip?: string;
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
  tooltip,
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
  // Held in a ref as well as state: a second tap can land before the re-render.
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);
  const busy = !!loading || pending;
  const isDisabled = disabled || busy;
  const keys = shortcut && desktop && Platform.OS === 'web' ? `${onMac ? '⌘' : 'Ctrl+'}${shortcut === 'Enter' ? 'Enter' : shortcut.toUpperCase()}` : null;
  const tip = (tooltip && desktop && Platform.OS === 'web' ? tooltip : null) ?? keys;

  // The browser draws hover and press as colour, the way web buttons do; a
  // phone has no hover and keeps its opacity dip on press.
  const webFill = (pressed?: boolean, hovered?: boolean): string => {
    if (variant === 'primary') return pressed ? t.c.primaryPressed : hovered ? t.c.primaryHover : t.c.primary;
    if (variant === 'ghost') return pressed || hovered ? t.c.card2 : t.c.card;
    if (!pressed && !hovered) return p.bg;
    // The chip tint, a little stronger; still 4.5:1 under the primary label.
    if (variant === 'secondary') return t.scheme === 'dark' ? 'rgba(85,155,255,0.20)' : 'rgba(8,91,204,0.14)';
    return p.bg;
  };

  const handlePress = () => {
    if (isDisabled || inFlight.current) return;
    if (haptic && Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    const ran = onPress?.();
    if (ran && typeof (ran as Promise<unknown>).then === 'function') {
      inFlight.current = true;
      setPending(true);
      const done = () => {
        inFlight.current = false;
        if (mounted.current) setPending(false);
      };
      (ran as Promise<unknown>).then(done, done);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy }}
      accessibilityLabel={title}
      onPress={handlePress}
      disabled={isDisabled}
      style={(state) => {
        const { pressed, hovered, focused } = state as WebPressState;
        return [
        {
          // A floor, not a fixed height: large system text or a long Tamil
          // label grows the button instead of being clipped by it.
          minHeight: heights[size],
          paddingVertical: size === 'sm' ? 4 : 6,
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
          // A slight give under the finger, so a press feels physical.
          transform: [{ scale: pressed && !isDisabled ? 0.97 : 1 }],
          // Its tooltip sits over whatever is next to it.
          zIndex: tip && hovered ? 10 : undefined,
        },
        focusRing(t, focused),
        style,
      ];
      }}
    >
      {(state) => (
        <>
          {busy ? (
            <ActivityIndicator color={p.fg} size="small" />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
              {icon ? <Icon name={icon} size={WEB ? 16 : fonts[size] + 3} color={p.fg} /> : null}
              {/* Tamil runs long: shrink a little, then take a second line (the
                  button grows to fit) before truncating. */}
              <Text
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                style={{ color: p.fg, fontSize: fonts[size], fontWeight: WEB ? '500' : '600', flexShrink: 1, textAlign: 'center' }}
              >
                {title}
              </Text>
              {iconRight ? <Icon name={iconRight} size={WEB ? 16 : fonts[size] + 3} color={p.fg} /> : null}
            </View>
          )}
          {/* The tooltip, or the keyboard shortcut, above the button while it is hovered. A
              sentence can run wider than the button: it lines up with the button's right edge
              and grows leftwards, so a page's action at the far right keeps it on screen. */}
          {tip && (state as WebPressState).hovered && !isDisabled ? (
            <View pointerEvents="none" style={{ position: 'absolute', bottom: '100%', left: tooltip ? -200 : 0, right: 0, alignItems: tooltip ? 'flex-end' : 'center', marginBottom: 6 }}>
              <View style={{ paddingHorizontal: tooltip ? 10 : 8, paddingVertical: tooltip ? 6 : 4, borderRadius: 6, backgroundColor: t.c.text, maxWidth: 280 }}>
                <Text numberOfLines={tooltip ? 3 : 1} style={{ color: t.c.bg, fontSize: tooltip ? 12 : 11, fontWeight: tooltip ? '500' : '600', textAlign: 'center' }}>
                  {tip}
                </Text>
              </View>
            </View>
          ) : null}
        </>
      )}
    </Pressable>
  );
}
