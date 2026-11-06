import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';

/** Icons are named by their MaterialCommunityIcons glyph on every platform. */
export type IconName = keyof typeof MaterialCommunityIcons.glyphMap;
export type IconProps = React.ComponentProps<typeof MaterialCommunityIcons>;

/**
 * The app's icon. Native draws the MaterialCommunityIcons glyph, as it always
 * has; the browser draws the matching Lucide outline (Icon.web.tsx).
 */
export function Icon(props: IconProps) {
  return <MaterialCommunityIcons {...props} />;
}
