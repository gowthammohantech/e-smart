import React from 'react';
import { Pressable, StyleProp, View, ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

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
        style={({ pressed }) => [base, variant === 'raised' ? t.shadow.card : null, pressed && { opacity: 0.75 }, style]}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={[base, variant === 'raised' ? t.shadow.card : null, style]}>{children}</View>;
}
