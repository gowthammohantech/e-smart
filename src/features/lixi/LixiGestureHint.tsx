import React, { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Keyboard, Pressable, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { LixiHintKey, useUiStore } from '@/store/uiStore';
import { LixiOrb } from './LixiOrb';
import { HINT_EVERY_MS, HINT_FIRST_MS, HINT_SHOW_MS, HINT_TEXT, nextHint } from './hints';

/**
 * A tip that floats above the tab bar every few minutes, taking turns between
 * the two gestures that open Lixi. A tip retires once the person uses its
 * gesture or taps "Got it"; with nothing left to teach, no timer runs.
 *
 * It only counts time while the tabs are what's on screen: not under a pushed
 * screen, not with the keyboard up, not in the background.
 *
 * Rendered by the tabs layout rather than inside the bar, `bottom` pixels up
 * from the screen edge: Android drops touches outside a parent's bounds, and
 * "Got it" has to be tappable.
 */
export function LixiGestureHint({ bottom }: { bottom: number }) {
  const t = useTheme();
  const focused = useIsFocused();
  const learned = useUiStore((s) => s.lixiHintsLearned);
  const access = useUiStore((s) => s.lixiAccess);
  const markLearned = useUiStore((s) => s.markLixiHintLearned);

  const [shown, setShown] = useState<LixiHintKey | null>(null);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [keyboard, setKeyboard] = useState(false);
  const [fade] = useState(() => new Animated.Value(0));
  const [bob] = useState(() => new Animated.Value(0));
  const last = useRef<LixiHintKey | null>(null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'));
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboard(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(false));
    return () => {
      sub.remove();
      show.remove();
      hide.remove();
    };
  }, []);

  const pending = nextHint(learned, access, null) !== null;
  const running = focused && appActive && !keyboard && pending;

  // The cycle: wait, fade one tip in, hold it, fade it out, repeat.
  useEffect(() => {
    if (!running) return;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const fire = () => {
      const state = useUiStore.getState();
      const key = nextHint(state.lixiHintsLearned, state.lixiAccess, last.current);
      if (!key) return;
      last.current = key;
      fade.setValue(0);
      setShown(key);
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      hideTimer = setTimeout(() => {
        Animated.timing(fade, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setShown(null));
      }, HINT_SHOW_MS);
    };
    const first = setTimeout(fire, HINT_FIRST_MS);
    const every = setInterval(fire, HINT_EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(every);
      if (hideTimer) clearTimeout(hideTimer);
      // Leaving the tabs (or the app) takes any tip with it.
      setShown(null);
    };
  }, [running, fade]);

  // A tip learned while on screen (the person just did the gesture) leaves at once.
  const rendered = shown && !learned[shown] ? shown : null;

  useEffect(() => {
    if (rendered !== 'swipeUp') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [rendered, bob]);

  if (!rendered) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom,
        alignItems: 'center',
        paddingBottom: t.spacing.sm,
        opacity: fade,
        transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
      }}
    >
      <View
        accessibilityRole="alert"
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.sm,
            paddingVertical: 8,
            paddingLeft: 10,
            paddingRight: 6,
            borderRadius: 999,
            backgroundColor: t.c.card,
            borderWidth: t.scheme === 'dark' ? 1 : 0,
            borderColor: t.c.line,
          },
          t.shadow.card,
        ]}
      >
        <LixiOrb size={22} />
        {rendered === 'swipeUp' ? (
          <Animated.View style={{ transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [2, -3] }) }] }}>
            <MaterialCommunityIcons name="gesture-swipe-up" size={18} color={t.c.primary} />
          </Animated.View>
        ) : (
          <MaterialCommunityIcons name="gesture-tap-hold" size={18} color={t.c.primary} />
        )}
        <Text variant="caption" weight="600">
          {HINT_TEXT[rendered]}
        </Text>
        <Pressable
          onPress={() => markLearned(rendered)}
          accessibilityRole="button"
          accessibilityLabel="Got it, don't show this tip again"
          hitSlop={8}
          style={({ pressed }) => ({
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
            backgroundColor: pressed ? t.c.card2 : t.c.chip,
          })}
        >
          <Text variant="caption" weight="700" style={{ color: t.c.primary }}>
            Got it
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}
