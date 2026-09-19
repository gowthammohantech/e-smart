import React from 'react';
import { Image } from 'expo-image';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The Elixir Books logo. The wordmark is navy, which vanishes on the dark
 * palette, so dark mode swaps in a copy with the navy lifted to white. The
 * coloured chevrons are the same in both.
 */
const ASSETS = {
  full: {
    light: require('../../assets/brand/elixir-books.png'),
    dark: require('../../assets/brand/elixir-books-dark.png'),
    ratio: 784 / 378,
  },
  mark: {
    light: require('../../assets/brand/elixir-mark.png'),
    dark: require('../../assets/brand/elixir-mark-dark.png'),
    ratio: 265 / 378,
  },
};

export function BrandLogo({ variant = 'full', height = 48 }: { variant?: 'full' | 'mark'; height?: number }) {
  const t = useTheme();
  const asset = ASSETS[variant];
  return (
    <Image
      source={asset[t.scheme]}
      style={{ height, width: height * asset.ratio }}
      contentFit="contain"
      accessibilityRole="image"
      accessibilityLabel="Elixir Books"
    />
  );
}
