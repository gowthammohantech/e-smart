import React from 'react';
import { Animated } from 'react-native';
import { useEntrance } from '../illustrations/motion';

/** Rows past this many appear at once; a long list shouldn't keep cascading. */
const MAX_STAGGERED = 12;
const STEP_MS = 35;

/**
 * Fades a list row in a beat after the one above it, the first time it mounts.
 * Rows that are already on screen keep their place when the list re-renders.
 */
export function Stagger({ index, children }: { index: number; children: React.ReactNode }) {
  if (index >= MAX_STAGGERED) return <>{children}</>;
  return <Entering delay={index * STEP_MS}>{children}</Entering>;
}

function Entering({ delay, children }: { delay: number; children: React.ReactNode }) {
  const enter = useEntrance({ delay, rise: 6, duration: 220 });
  return <Animated.View style={enter}>{children}</Animated.View>;
}
