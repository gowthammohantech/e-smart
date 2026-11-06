import { useEffect, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { NATIVE_DRIVER } from '../theme/motion';
import { useReducedMotion } from '../theme/useReducedMotion';

const STEPS = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
const wave = (p: number, shift: number) => Math.sin((p + shift) * Math.PI * 2);

/**
 * One looping 0..1 phase that a whole scene can hang its motion on, so every
 * piece drifts in step. Stays at 0 under Reduce Motion, which leaves each piece
 * resting at its offset rather than moving.
 */
export function useLoopPhase(duration = 3600) {
  const [phase] = useState(() => new Animated.Value(0));
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) {
      phase.setValue(0);
      return;
    }
    const loop = Animated.loop(Animated.timing(phase, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: NATIVE_DRIVER }));
    loop.start();
    return () => loop.stop();
  }, [phase, duration, reduce]);

  /** A sine drift of `amp` points, offset by `shift` of a cycle. */
  const bob = (amp: number, shift: number) =>
    phase.interpolate({ inputRange: STEPS, outputRange: STEPS.map((p) => wave(p, shift) * amp) });

  /** An opacity that pulses between `min` and 1, offset by `shift` of a cycle. */
  const twinkle = (shift: number, min = 0.25) =>
    phase.interpolate({ inputRange: STEPS, outputRange: STEPS.map((p) => min + (1 - min) * (0.5 + 0.5 * wave(p * 2, shift))) });

  /** A 0..`distance` sweep that runs once per cycle — scanner beams, search sweeps. */
  const sweep = (distance: number) => phase.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, distance, 0] });

  return { phase, bob, twinkle, sweep };
}

/**
 * A one-off fade-and-rise for content arriving on screen. Pass a changing `key`
 * to replay it — a wizard step, say. Lands instantly under Reduce Motion.
 */
export function useEntrance({ delay = 0, rise = 8, duration = 260, key }: { delay?: number; rise?: number; duration?: number; key?: unknown } = {}) {
  const [v] = useState(() => new Animated.Value(0));
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) {
      v.setValue(1);
      return;
    }
    v.setValue(0);
    const a = Animated.timing(v, { toValue: 1, duration, delay, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE_DRIVER });
    a.start();
    return () => a.stop();
  }, [v, delay, duration, reduce, key]);

  return {
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [rise, 0] }) }],
  };
}

/** A springy scale-in for a success mark. Lands instantly under Reduce Motion. */
export function usePop({ delay = 120, from = 0.6 }: { delay?: number; from?: number } = {}) {
  const [v] = useState(() => new Animated.Value(0));
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) {
      v.setValue(1);
      return;
    }
    v.setValue(0);
    const a = Animated.sequence([
      Animated.delay(delay),
      Animated.spring(v, { toValue: 1, friction: 5, tension: 120, useNativeDriver: NATIVE_DRIVER }),
    ]);
    a.start();
    return () => a.stop();
  }, [v, delay, reduce]);

  return {
    opacity: v.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [from, 1] }) }],
  };
}

/** A slow opacity breath between `min` and 1, for loading marks and icon discs. */
export function usePulse({ min = 0.55, duration = 1400 }: { min?: number; duration?: number } = {}) {
  const [v] = useState(() => new Animated.Value(1));
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) {
      v.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: min, duration: duration / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(v, { toValue: 1, duration: duration / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE_DRIVER }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, min, duration, reduce]);

  return v;
}
