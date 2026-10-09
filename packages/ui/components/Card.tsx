import React from 'react';
import { Pressable, StyleProp, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { focusRing, type WebPressState } from '../theme/interaction';

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
    borderWidth: variant === 'outline' ? 1 : t.scheme === 'dark' ? 1 : 0,
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
            { opacity: pressed ? 0.75 : hovered ? 0.9 : 1 },
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
