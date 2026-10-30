import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';
import { settledContent, settledText, type ToastApi, type ToastOptions, type ToastTone } from './toastTypes';

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

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<ToastMessage | null>(null);

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
      {children}
      {message ? <ToastView key={message.id} message={message} onDone={done} /> : null}
    </ToastContext.Provider>
  );
}

function ToastView({ message, onDone }: { message: ToastMessage; onDone: (id: number) => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [anim] = useState(() => new Animated.Value(0));
  const sticky = message.tone === 'loading';

  useEffect(() => {
    const enter = Animated.spring(anim, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 220 });
    // A toast with a button stays a little longer, so there is time to reach it.
    const run = sticky
      ? enter
      : Animated.sequence([
          enter,
          Animated.delay(message.action ? 4000 : 2200),
          Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }),
        ]);
    run.start(({ finished }) => {
      if (finished && !sticky) onDone(message.id);
    });
    return () => run.stop();
  }, [anim, onDone, message.id, message.action, sticky]);

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
  const glyph = sticky ? <ActivityIndicator size="small" color={t.c.primary} /> : <MaterialCommunityIcons name={icon} size={19} color={color} />;
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
    <Animated.View
      pointerEvents={pointerEvents}
      accessibilityLiveRegion="polite"
      style={[
        {
          position: 'absolute',
          left: t.spacing.lg,
          right: t.spacing.lg,
          bottom: insets.bottom + 88,
          backgroundColor: t.c.paper,
          borderRadius: t.radius.md,
          borderWidth: 1,
          borderColor: t.c.line,
          paddingVertical: t.spacing.md,
          paddingHorizontal: t.spacing.lg,
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.md,
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
        },
        t.shadow.sheet,
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
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
