import { Platform } from 'react-native';

/**
 * Whether an animation can ask for the native driver. A browser has no native
 * animated module: React Native Web falls back to JS for a one-off animation,
 * but hands an `Animated.loop` to a native loop that never comes, so the loop
 * plays once and freezes. Every looping animation passes this instead of `true`.
 */
export const NATIVE_DRIVER = Platform.OS !== 'web';
