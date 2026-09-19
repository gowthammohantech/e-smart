import React, { useEffect, useMemo, useState } from 'react';
import { Animated, PanResponder, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { useUiStore } from '@/store/uiStore';
import { LIXI, LixiOrb } from './LixiOrb';
import { openLixi } from './open';

const SIZE = 52;
/** How much of the orb hides past the screen edge while parked. */
const TUCK = SIZE * 0.35;
/** Keep clear of the header above and the tab bar below. */
const TOP_CLEARANCE = 72;
const BOTTOM_CLEARANCE = 150;
/** Movement under this is a tap, not a drag. */
const TAP_SLOP = 6;

/**
 * A chat-head style orb that floats over the tab screens. Drag it anywhere;
 * it snaps to the nearer side edge, part-tucked out of the way, and remembers
 * where it was left. Tap to open Lixi.
 */
export function LixiFloatingOrb({ nudge = 0 }: { nudge?: number }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const spot = useUiStore((s) => s.lixiOrbSpot);
  const setSpot = useUiStore((s) => s.setLixiOrbSpot);

  const minY = insets.top + TOP_CLEARANCE;
  const maxY = height - insets.bottom - BOTTOM_CLEARANCE;
  const restX = (side: 'left' | 'right') => (side === 'left' ? -TUCK : width - SIZE + TUCK);
  const clampY = (y: number) => Math.min(maxY, Math.max(minY, y));

  // The orb is always at rest on its saved spot when a drag begins, so the
  // drag is just that spot plus the finger's travel.
  const restY = clampY(spot.y * height);
  const [pos] = useState(() => new Animated.ValueXY({ x: restX(spot.side), y: restY }));
  const settle = (to: { x: number; y: number }) =>
    Animated.spring(pos, { toValue: to, useNativeDriver: false, damping: 18, stiffness: 180 }).start();

  // Follow the saved spot, and rotation or resizing.
  useEffect(() => {
    settle({ x: restX(spot.side), y: restY });
    // restX and settle only read width and pos, which are listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spot.side, restY, width, pos]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderMove: (_, g) => pos.setValue({ x: restX(spot.side) + g.dx, y: restY + g.dy }),
        onPanResponderRelease: (_, g) => {
          if (Math.abs(g.dx) < TAP_SLOP && Math.abs(g.dy) < TAP_SLOP) {
            settle({ x: restX(spot.side), y: restY });
            openLixi();
            return;
          }
          const side = restX(spot.side) + g.dx + SIZE / 2 < width / 2 ? 'left' : 'right';
          const y = clampY(restY + g.dy);
          // Snap now; saving the same spot again wouldn't re-run the effect.
          settle({ x: restX(side), y });
          setSpot({ side, y: y / height });
        },
      }),
    // restX, clampY and settle only read the listed values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pos, spot.side, restY, width, height, minY, maxY, setSpot],
  );

  return (
    <Animated.View
      {...responder.panHandlers}
      accessible
      accessibilityRole="button"
      accessibilityLabel={nudge ? `Ask Lixi, ${nudge} things to look at` : 'Ask Lixi'}
      accessibilityHint="Drag to move it"
      onAccessibilityTap={() => openLixi()}
      style={{ position: 'absolute', left: 0, top: 0, width: SIZE, height: SIZE, transform: pos.getTranslateTransform() }}
    >
      <LixiOrb size={SIZE} />
      {nudge > 0 ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -2,
            [spot.side === 'right' ? 'left' : 'right']: -2,
            minWidth: 20,
            height: 20,
            paddingHorizontal: 5,
            borderRadius: 10,
            backgroundColor: LIXI.red,
            borderWidth: 2,
            borderColor: t.c.bg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{nudge}</Text>
        </View>
      ) : null}
    </Animated.View>
  );
}
