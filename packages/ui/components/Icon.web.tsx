import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ICON_DATA } from './iconData.web';

export type IconName = keyof typeof MaterialCommunityIcons.glyphMap;
export type IconProps = React.ComponentProps<typeof MaterialCommunityIcons>;

const warned = new Set<string>();

/**
 * The browser's icon: the Lucide outline drawn for the MaterialCommunityIcons
 * name (iconData.web.ts), so every screen keeps naming icons the way native
 * does. A name with no drawing yet falls back to its MCI glyph, never a gap.
 */
export function Icon({ name, size = 24, color, style }: IconProps) {
  const node = ICON_DATA[name];
  if (!node) {
    if (process.env.NODE_ENV !== 'production' && !warned.has(name)) {
      warned.add(name);
      console.warn(`Icon: no Lucide drawing for "${name}"; add it to packages/ui/scripts/gen-web-icons.mjs.`);
    }
    return <MaterialCommunityIcons name={name} size={size} color={color} style={style} />;
  }
  // Lucide's 2px stroke is drawn for 24px; scaled down it stays crisp, scaled
  // up a touch lighter reads better beside Inter.
  const strokeWidth = size <= 16 ? 2 : 1.75;
  return (
    <View aria-hidden style={[{ width: size, height: size, flexShrink: 0, pointerEvents: 'none' }, style as StyleProp<ViewStyle>]}>
      {React.createElement(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: typeof color === 'string' ? color : 'currentColor',
          strokeWidth,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          focusable: 'false',
          style: { display: 'block' },
        },
        node.map(([tag, attrs], i) => React.createElement(tag, { key: i, ...attrs })),
      )}
    </View>
  );
}
