import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

const STEPS = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
const wave = (p: number, shift: number) => Math.sin((p + shift) * Math.PI * 2);

/**
 * One looping 0..1 phase that a whole scene can hang its motion on, so every
 * piece drifts in step. Stays at 0 under Reduce Motion, which leaves each piece
 * resting at its offset rather than moving.
 */
export function useLoopPhase(duration = 3600) {
  const [phase] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce || cancelled) return;
      loop = Animated.loop(Animated.timing(phase, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }));
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [phase, duration]);

  /** A sine drift of `amp` points, offset by `shift` of a cycle. */
  const bob = (amp: number, shift: number) =>
    phase.interpolate({ inputRange: STEPS, outputRange: STEPS.map((p) => wave(p, shift) * amp) });

  /** An opacity that pulses between `min` and 1, offset by `shift` of a cycle. */
  const twinkle = (shift: number, min = 0.25) =>
    phase.interpolate({ inputRange: STEPS, outputRange: STEPS.map((p) => min + (1 - min) * (0.5 + 0.5 * wave(p * 2, shift))) });

  return { bob, twinkle };
}
