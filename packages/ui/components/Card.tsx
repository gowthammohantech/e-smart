import React from 'react';
import { Platform, Pressable, StyleProp, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { focusRing, type WebPressState } from '../theme/interaction';

const WEB = Platform.OS === 'web';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padded?: boolean;
  variant?: 'raised' | 'flat' | 'outline';
  accessibilityLabel?: string;
};

export function Card({ children, style, onPress, padded = true, variant = 'raised', accessibilityLabel }: Props) {
  const t = useTheme();
  const base: ViewStyle = {
    backgroundColor: variant === 'flat' ? t.c.card2 : t.c.card,
    borderRadius: t.radius.lg,
    // The browser draws every card with a hairline, in both themes; a phone
    // keeps its borderless light cards.
    borderWidth: variant === 'outline' || WEB ? 1 : t.scheme === 'dark' ? 1 : 0,
    borderColor: t.c.line,
    padding: padded ? t.spacing.lg : 0,
    overflow: 'hidden',
  };

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={(state) => {
          const { pressed, hovered, focused } = state as WebPressState;
          return [
            base,
            variant === 'raised' ? t.shadow.card : null,
            WEB
              ? { borderColor: hovered || pressed ? t.c.lineStrong : t.c.line, opacity: pressed ? 0.9 : 1 }
              : { opacity: pressed ? 0.75 : hovered ? 0.9 : 1 },
            focusRing(t, focused),
            style,
          ];
        }}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={[base, variant === 'raised' ? t.shadow.card : null, style]}>{children}</View>;
}
