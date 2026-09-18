import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The Welcome screen's hero: an invoice card with a paid badge and a coin,
 * drawn with views so it stays crisp at any density and follows the theme.
 * Each piece bobs on its own phase; motion is skipped under Reduce Motion.
 * Decorative — the title beside it carries the meaning.
 */
export function WelcomeHero() {
  const t = useTheme();
  const [phase] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce || cancelled) return;
      loop = Animated.loop(
        Animated.timing(phase, { toValue: 1, duration: 3200, easing: Easing.linear, useNativeDriver: true }),
      );
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [phase]);

  /** A sine drift of `amp` points, offset by `shift` of a cycle. */
  const STEPS = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
  const bob = (amp: number, shift: number) =>
    phase.interpolate({
      inputRange: STEPS,
      outputRange: STEPS.map((p) => Math.sin((p + shift) * Math.PI * 2) * amp),
    });

  const line = (width: number, color: string, height = 6) => (
    <View style={{ width, height, borderRadius: height, backgroundColor: color }} />
  );

  return (
    <View
      style={{ width: 196, height: 156, alignItems: 'center', justifyContent: 'center' }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={{ position: 'absolute', width: 148, height: 148, borderRadius: 74, backgroundColor: t.c.chip }} />

      <Animated.View
        style={{
          width: 104,
          height: 128,
          borderRadius: t.radius.lg,
          backgroundColor: t.c.card,
          borderWidth: 1,
          borderColor: t.c.line,
          padding: 14,
          gap: 9,
          transform: [{ translateY: bob(4, 0) }],
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6,
        }}
      >
        {line(46, t.c.primary, 7)}
        {line(70, t.c.mutedSoft)}
        {line(56, t.c.mutedSoft)}
        {line(64, t.c.mutedSoft)}
        <View style={{ flex: 1 }} />
        <View style={{ height: 22, borderRadius: t.radius.sm, backgroundColor: t.c.chip, justifyContent: 'center', paddingHorizontal: 8 }}>
          {line(40, t.c.primary, 5)}
        </View>
      </Animated.View>

      <Animated.View
        style={{
          position: 'absolute',
          top: 10,
          right: 34,
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: t.c.good,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ translateY: bob(5, 0.25) }],
        }}
      >
        <MaterialCommunityIcons name="check" size={20} color="#FFFFFF" />
      </Animated.View>

      <Animated.View
        style={{
          position: 'absolute',
          bottom: 16,
          left: 30,
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: t.c.primary,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ translateY: bob(5, 0.5) }],
        }}
      >
        <MaterialCommunityIcons name="currency-inr" size={20} color={t.c.onPrimary} />
      </Animated.View>
    </View>
  );
}
