import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/theme/ThemeProvider';
import {
  ILLUSTRATIONS,
  ILLUSTRATION_SIZES,
  IllustrationName,
  IllustrationSize,
} from '@/illustrations/registry';

/**
 * A decorative illustration.
 *
 * Hidden from assistive technology by default — the heading and message beside
 * it already carry the meaning, so announcing the art would only add noise.
 * Pass `accessibilityLabel` where the illustration is the only content.
 */
export function Illustration({
  name,
  size = 'full',
  height,
  style,
  accessibilityLabel,
  tint = false,
}: {
  name: IllustrationName;
  size?: IllustrationSize;
  /** Overrides the `size` preset. */
  height?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  /**
   * Opt-in tinted disc behind the art. Off by default — both the placeholder
   * set and Storyset's own illustrations carry their own background shape, and
   * a second disc competes with it.
   */
  tint?: boolean;
}) {
  const t = useTheme();
  const h = height ?? ILLUSTRATION_SIZES[size];
  const w = h * (4 / 3);
  const decorative = !accessibilityLabel;

  return (
    <View
      style={[{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }, style]}
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}
    >
      {tint ? (
        <View
          style={{
            position: 'absolute',
            width: h * 0.82,
            height: h * 0.82,
            borderRadius: h,
            backgroundColor: t.c.chip,
          }}
        />
      ) : null}
      <Image
        source={ILLUSTRATIONS[name]}
        style={{ width: w, height: h }}
        contentFit="contain"
        cachePolicy="memory-disk"
        transition={220}
      />
    </View>
  );
}
