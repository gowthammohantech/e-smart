import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

const LOGO = require('../../../assets/lixi/lixi-orb.png');

/** Lixi's palette, sampled from the logo. Fixed rather than themed: it's a brand mark. */
export const LIXI = { blue: '#0B5FE0', cyan: '#2BB6F0', red: '#E5171F', yellow: '#F6BE1A' };

/**
 * Lixi's orb: the logo breathing inside a soft halo in its own colours.
 * While `thinking`, an aurora ring appears and turns around it. Motion stops
 * under Reduce Motion; the logo alone still reads.
 */
export function LixiOrb({ size = 56, thinking = false }: { size?: number; thinking?: boolean }) {
  const [spin] = useState(() => new Animated.Value(0));
  const [breath] = useState(() => new Animated.Value(0));
  const [ringIn] = useState(() => new Animated.Value(thinking ? 1 : 0));
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((r) => !cancelled && setReduce(r));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (reduce) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [reduce, breath]);

  useEffect(() => {
    Animated.timing(ringIn, { toValue: thinking ? 1 : 0, duration: 220, useNativeDriver: true }).start();
    if (!thinking || reduce) return;
    spin.setValue(0);
    const turn = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }),
    );
    turn.start();
    return () => turn.stop();
  }, [thinking, reduce, spin, ringIn]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const haloScale = breath.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.12] });
  const haloOpacity = breath.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.12] });
  const logoScale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });

  const stroke = Math.max(2, size * 0.05);
  const logo = size - stroke * 2 - 2;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Halo: two offset washes so it glows blue on one side and red-gold on the other, like the logo. */}
      <Animated.View
        pointerEvents="none"
        style={{ position: 'absolute', width: size, height: size, opacity: haloOpacity, transform: [{ scale: haloScale }] }}
      >
        <View style={{ position: 'absolute', left: 0, top: 0, width: size * 0.7, height: size * 0.7, borderRadius: size, backgroundColor: LIXI.blue }} />
        <View style={{ position: 'absolute', right: 0, top: size * 0.1, width: size * 0.7, height: size * 0.7, borderRadius: size, backgroundColor: LIXI.red }} />
        <View style={{ position: 'absolute', right: size * 0.15, bottom: 0, width: size * 0.6, height: size * 0.6, borderRadius: size, backgroundColor: LIXI.yellow }} />
      </Animated.View>

      <Animated.View pointerEvents="none" style={{ position: 'absolute', opacity: ringIn, transform: [{ rotate }] }}>
        <Svg width={size} height={size}>
          <Defs>
            <LinearGradient id="lixiRing" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={LIXI.cyan} />
              <Stop offset="0.4" stopColor={LIXI.blue} />
              <Stop offset="0.7" stopColor={LIXI.red} />
              <Stop offset="1" stopColor={LIXI.yellow} />
            </LinearGradient>
          </Defs>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={size / 2 - stroke / 2}
            stroke="url(#lixiRing)"
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${Math.PI * (size - stroke) * 0.7} ${Math.PI * (size - stroke) * 0.3}`}
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>

      <Animated.View style={{ transform: [{ scale: logoScale }] }}>
        <Image source={LOGO} style={{ width: logo, height: logo }} contentFit="contain" accessibilityIgnoresInvertColors />
      </Animated.View>
    </View>
  );
}

/** The logo without the motion, for small places like a chat avatar. */
export function LixiMark({ size = 26 }: { size?: number }) {
  return <Image source={LOGO} style={{ width: size, height: size }} contentFit="contain" accessibilityIgnoresInvertColors />;
}
