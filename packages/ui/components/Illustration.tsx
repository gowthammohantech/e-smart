import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import {
  ILLUSTRATIONS,
  ILLUSTRATION_SIZES,
  IllustrationName,
  IllustrationSize,
} from '../illustrations/registry';

/**
 * A decorative, gently animated illustration.
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
   * Opt-in tinted disc behind the art. Off by default — every scene draws its
   * own soft backdrop, and a second disc competes with it.
   */
  tint?: boolean;
}) {
  const t = useTheme();
  const h = height ?? ILLUSTRATION_SIZES[size];
  const w = h * (4 / 3);
  const decorative = !accessibilityLabel;
  const Scene = ILLUSTRATIONS[name];

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
      <Scene width={w} height={h} />
    </View>
  );
}
