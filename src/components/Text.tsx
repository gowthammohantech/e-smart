import React from 'react';
import { StyleSheet, Text as RNText, TextProps, TextStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

export type TextVariant =
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'title'
  | 'body'
  | 'small'
  | 'caption'
  | 'micro'
  | 'mono';

export type TextTone = 'default' | 'muted' | 'primary' | 'good' | 'warn' | 'bad' | 'onPrimary';

type Props = TextProps & {
  variant?: TextVariant;
  tone?: TextTone;
  weight?: '400' | '500' | '600' | '700' | '800';
  center?: boolean;
  children?: React.ReactNode;
};

export function Text({ variant = 'body', tone = 'default', weight, center, style, ...rest }: Props) {
  const t = useTheme();

  const sizes: Record<TextVariant, TextStyle> = {
    display: { fontSize: t.fontSize.display, fontWeight: '800', letterSpacing: -0.8 },
    h1: { fontSize: t.fontSize.h1, fontWeight: '700', letterSpacing: -0.6 },
    h2: { fontSize: t.fontSize.h2, fontWeight: '700', letterSpacing: -0.4 },
    h3: { fontSize: t.fontSize.h3, fontWeight: '700', letterSpacing: -0.2 },
    title: { fontSize: t.fontSize.title, fontWeight: '600' },
    body: { fontSize: t.fontSize.body, fontWeight: '400' },
    small: { fontSize: t.fontSize.small, fontWeight: '400' },
    caption: { fontSize: t.fontSize.caption, fontWeight: '500' },
    micro: { fontSize: t.fontSize.micro, fontWeight: '600', letterSpacing: 0.4 },
    mono: { fontSize: t.fontSize.small, fontWeight: '500', fontVariant: ['tabular-nums'] },
  };

  const tones: Record<TextTone, string> = {
    default: t.c.text,
    muted: t.c.muted,
    primary: t.c.primary,
    good: t.c.good,
    warn: t.c.warn,
    bad: t.c.bad,
    onPrimary: t.c.onPrimary,
  };

  return (
    <RNText
      style={[
        sizes[variant],
        { color: tones[tone] },
        weight ? { fontWeight: weight } : null,
        center ? styles.center : null,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({ center: { textAlign: 'center' } });
