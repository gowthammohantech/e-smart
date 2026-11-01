import React from 'react';
import { StyleSheet, Text as RNText, TextProps, TextStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

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

  // Tracking and line height come from the theme, which knows the script.
  // Under Latin these resolve to the original values and `undefined`, so
  // English rendering is unchanged to the pixel; under Tamil the negative
  // tracking goes to zero and every variant gains leading for the vowel signs
  // that sit above and below the line.
  const px = (size: number, tracking: number): TextStyle => ({
    fontSize: size,
    letterSpacing: t.type.tracking(tracking),
    lineHeight: t.type.lineHeight(size),
  });

  const sizes: Record<TextVariant, TextStyle> = {
    display: { ...px(t.fontSize.display, -0.8), fontWeight: '800' },
    h1: { ...px(t.fontSize.h1, -0.6), fontWeight: '700' },
    h2: { ...px(t.fontSize.h2, -0.4), fontWeight: '700' },
    h3: { ...px(t.fontSize.h3, -0.2), fontWeight: '700' },
    title: { ...px(t.fontSize.title, 0), fontWeight: '600' },
    body: { ...px(t.fontSize.body, 0), fontWeight: '400' },
    small: { ...px(t.fontSize.small, 0), fontWeight: '400' },
    caption: { ...px(t.fontSize.caption, 0), fontWeight: '500' },
    micro: { ...px(t.fontSize.micro, 0.4), fontWeight: '600' },
    // Digits are ASCII in every language, so the tabular figures stay.
    mono: { ...px(t.fontSize.small, 0), fontWeight: '500', fontVariant: ['tabular-nums'] },
  };

  // Caller overrides go through the same script metrics as the variants. A
  // new size without a line height would keep the variant's leading, which
  // under Tamil puts a 10px label on a 23px line; and the tracking on
  // uppercase captions spreads Tamil vowel signs away from their letters.
  const override = StyleSheet.flatten(style);
  const leading: TextStyle | null =
    override?.fontSize != null && override.lineHeight == null
      ? { lineHeight: t.type.lineHeight(override.fontSize) }
      : null;
  const tracked: TextStyle | null =
    override?.letterSpacing != null ? { letterSpacing: t.type.tracking(override.letterSpacing) } : null;

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
        leading,
        style,
        tracked,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({ center: { textAlign: 'center' } });
