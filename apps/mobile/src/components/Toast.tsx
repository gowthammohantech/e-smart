import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

type ToastTone = 'info' | 'success' | 'error';
type ToastMessage = { id: number; text: string; tone: ToastTone };

const ToastContext = createContext<{ show: (text: string, tone?: ToastTone) => void }>({
  show: () => {},
});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<ToastMessage | null>(null);

  const show = useCallback((text: string, tone: ToastTone = 'info') => {
    // The id only has to be unique enough to key a remount.
    setMessage({ id: Date.now(), text, tone });
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {message ? <ToastView key={message.id} message={message} onDone={() => setMessage(null)} /> : null}
    </ToastContext.Provider>
  );
}

function ToastView({ message, onDone }: { message: ToastMessage; onDone: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.sequence([
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 220 }),
      Animated.delay(2200),
      Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => onDone());
  }, [anim, onDone]);

  const icon =
    message.tone === 'success' ? 'check-circle' : message.tone === 'error' ? 'alert-circle' : 'information';
  const color = message.tone === 'success' ? t.c.good : message.tone === 'error' ? t.c.bad : t.c.primary;

  return (
    <Animated.View
      pointerEvents="none"
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
      <MaterialCommunityIcons name={icon} size={19} color={color} />
      <Text variant="small" style={{ flex: 1 }}>
        {message.text}
      </Text>
    </Animated.View>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
