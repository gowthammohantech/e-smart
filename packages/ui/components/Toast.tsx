import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Platform, Pressable, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';
import { settledContent, settledText, type ToastApi, type ToastOptions, type ToastTone } from './toastTypes';
import { usePop } from '../illustrations/motion';

export type { ToastApi, ToastContent, ToastIcon, ToastOptions, ToastTone } from './toastTypes';
export { TOAST_ANCHOR_ID } from './toastTypes';

/** The phone apps' toast: a card above the tab bar. A browser gets Toast.web.tsx (Sileo) instead. */

type ToastMessage = {
  id: number;
  text: string;
  /** 'loading' is the promise toast's working state; it stays up until the task settles. */
  tone: ToastTone | 'loading';
} & ToastOptions;

const ToastContext = createContext<ToastApi>({
  show: () => {},
  promise: (task) => task,
});

/** Footers registered with useToastClearance, so the toast can sit above the tallest. */
const ClearanceContext = createContext<(key: number, height: number) => void>(() => {});

let nextId = 0;
let nextFooter = 0;

/** Where a toast sits above the bottom: clear of the tab bar, or of a taller footer. */
const TAB_BAR_CLEARANCE = 88;
/** How long a toast stays: long enough to read, never long enough to get in the way. */
const readingTime = (text: string, detail?: string) => Math.min(5000, Math.max(2200, 60 * (text.length + (detail?.length ?? 0))));
const TOAST_MAX_WIDTH = 420;

/**
 * For a screen's pinned bottom bar (FormActions, an editor's footer): put the
 * returned handler on its onLayout and the toast lands above the bar instead
 * of over its buttons.
 */
export function useToastClearance(): (e: LayoutChangeEvent) => void {
  const register = useContext(ClearanceContext);
  const [key] = useState(() => ++nextFooter);
  useEffect(() => () => register(key, 0), [register, key]);
  return useCallback((e: LayoutChangeEvent) => register(key, e.nativeEvent.layout.height), [register, key]);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<ToastMessage | null>(null);
  const footers = useRef(new Map<number, number>());
  const [clearance, setClearance] = useState(0);
  const register = useCallback((key: number, height: number) => {
    if (height > 0) footers.current.set(key, height);
    else footers.current.delete(key);
    setClearance(Math.max(0, ...footers.current.values()));
  }, []);

  const put = useCallback((text: string, tone: ToastMessage['tone'], options?: ToastOptions) => {
    // The id keys a remount, so a new message restarts the animation.
    setMessage({ id: ++nextId, text, tone, ...options });
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show: (text, tone = 'info', options) => put(text, tone, options),
      promise: (task, messages) => {
        put(messages.loading, 'loading');
        task.then(
          (value) => {
            const { text, ...rest } = settledContent(messages.success, value);
            put(text, 'success', { icon: messages.icon, ...rest });
          },
          (err: unknown) => put(settledText(messages.error, err), 'error'),
        );
        return task;
      },
    }),
    [put],
  );

  // Only the message that finished may clear itself; a newer one may already be showing.
  const done = useCallback((id: number) => setMessage((m) => (m?.id === id ? null : m)), []);

  return (
    <ToastContext.Provider value={api}>
      <ClearanceContext.Provider value={register}>
        {children}
        {message ? <ToastView key={message.id} message={message} onDone={done} clearance={clearance} /> : null}
      </ClearanceContext.Provider>
    </ToastContext.Provider>
  );
}

function ToastView({ message, onDone, clearance }: { message: ToastMessage; onDone: (id: number) => void; clearance: number }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [anim] = useState(() => new Animated.Value(0));
  const sticky = message.tone === 'loading';
  // The tone's icon springs in just after the toast lands.
  const pop = usePop({ delay: 140, from: 0.3 });

  // iOS has no live regions: VoiceOver reads a toast only when told to.
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AccessibilityInfo.announceForAccessibility(message.detail ? `${message.text}. ${message.detail}` : message.text);
  }, [message.id, message.text, message.detail]);

  useEffect(() => {
    const enter = Animated.spring(anim, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 220 });
    // A long message stays long enough to read; one with a button a little
    // longer, so there is time to reach it.
    const hold = Math.max(readingTime(message.text, message.detail), message.action ? 4000 : 0);
    const run = sticky
      ? enter
      : Animated.sequence([
          enter,
          Animated.delay(hold),
          Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }),
        ]);
    run.start(({ finished }) => {
      if (finished && !sticky) onDone(message.id);
    });
    return () => run.stop();
  }, [anim, onDone, message.id, message.action, message.text, message.detail, sticky]);

  const icon =
    message.icon ??
    (message.tone === 'success'
      ? 'check-circle'
      : message.tone === 'error'
        ? 'alert-circle'
        : message.tone === 'warning'
          ? 'alert'
          : 'information');
  const color =
    message.tone === 'success'
      ? t.c.good
      : message.tone === 'error'
        ? t.c.bad
        : message.tone === 'warning'
          ? t.c.warn
          : t.c.primary;
  const glyph = sticky ? (
    <ActivityIndicator size="small" color={t.c.primary} />
  ) : (
    <Animated.View style={pop}>
      <Icon name={icon} size={19} color={color} />
    </Animated.View>
  );
  const action = message.action ? (
    <Pressable
      onPress={() => {
        message.action?.onPress();
        onDone(message.id);
      }}
      hitSlop={8}
      accessibilityRole="button"
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <Text variant="small" tone="primary" weight="700">
        {message.action.label}
      </Text>
    </Pressable>
  ) : null;
  // Taps pass through unless there is a button to press.
  const pointerEvents = message.action ? 'box-none' : 'none';

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: t.spacing.lg,
        right: t.spacing.lg,
        // Footers include the safe area in their height; the tab bar doesn't.
        bottom: Math.max(insets.bottom + TAB_BAR_CLEARANCE, clearance + t.spacing.sm),
        alignItems: 'center',
      }}
    >
    <Animated.View
      pointerEvents={pointerEvents}
      accessibilityLiveRegion="polite"
      style={[
        {
          width: '100%',
          maxWidth: TOAST_MAX_WIDTH,
          backgroundColor: t.c.paper,
          borderRadius: t.radius.md,
          borderWidth: 1,
          borderColor: t.c.line,
          paddingVertical: 10,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.md,
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
        },
        t.shadow.card,
      ]}
    >
      {glyph}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="small">{message.text}</Text>
        {message.detail ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {message.detail}
          </Text>
        ) : null}
      </View>
      {action}
    </Animated.View>
    </View>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
