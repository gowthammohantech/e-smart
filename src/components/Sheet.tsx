import React, { useEffect, useState } from 'react';
import {
  Animated,
  Dimensions,
  Keyboard,
  KeyboardEvent,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Fraction of the screen the sheet may occupy. */
  maxHeightRatio?: number;
  scroll?: boolean;
  footer?: React.ReactNode;
  /** Pinned above the scrolling body (e.g. a search bar). */
  header?: React.ReactNode;
  /**
   * Hold the sheet at its full available height instead of sizing to content,
   * so filtering a list doesn't collapse the sheet under the user's finger.
   */
  fillHeight?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
};

/**
 * Bottom sheet built on the platform Modal so it behaves natively on both
 * platforms without pulling in a gesture library.
 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  maxHeightRatio = 0.86,
  scroll = true,
  footer,
  header,
  fillHeight = false,
  contentStyle,
}: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  // Lazy state rather than a ref, so the animated values are never read
  // during render.
  const [translate] = useState(() => new Animated.Value(600));
  const [fade] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translate, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 240 }),
        Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      translate.setValue(600);
      fade.setValue(0);
    }
  }, [visible, translate, fade]);

  // The Modal is edge-to-edge on both platforms, so nothing resizes it when
  // the keyboard opens — lift the sheet ourselves.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    if (!visible) return;
    const ios = Platform.OS === 'ios';
    const onChange = (e: KeyboardEvent | null) => {
      if (ios && e) {
        LayoutAnimation.configureNext({
          duration: e.duration || 250,
          update: { type: LayoutAnimation.Types.keyboard },
        });
      }
      setKeyboardHeight(e ? e.endCoordinates.height : 0);
    };
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', onChange);
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', (e) =>
      onChange(ios ? { ...e, endCoordinates: { ...e.endCoordinates, height: 0 } } : null),
    );
    return () => {
      show.remove();
      hide.remove();
      setKeyboardHeight(0);
    };
  }, [visible]);

  const windowHeight = Dimensions.get('window').height;
  const maxHeight = Math.min(
    windowHeight * maxHeightRatio,
    windowHeight - keyboardHeight - insets.top - t.spacing.md,
  );
  const Body = scroll ? ScrollView : View;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={{ flex: 1, backgroundColor: t.c.overlay, opacity: fade }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
      </Animated.View>

      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: keyboardHeight,
            maxHeight,
            height: fillHeight ? maxHeight : undefined,
            backgroundColor: t.c.paper,
            borderTopLeftRadius: t.radius.xl,
            borderTopRightRadius: t.radius.xl,
            borderTopWidth: t.scheme === 'dark' ? 1 : 0,
            borderColor: t.c.line,
            paddingBottom: keyboardHeight > 0 ? 0 : insets.bottom,
            transform: [{ translateY: translate }],
          },
          t.shadow.sheet,
        ]}
      >
        <View style={{ alignItems: 'center', paddingTop: t.spacing.sm }}>
          <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: t.c.line }} />
        </View>

        {title ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: t.spacing.lg,
              paddingTop: t.spacing.md,
              paddingBottom: t.spacing.sm,
              gap: t.spacing.md,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text variant="title">{title}</Text>
              {subtitle ? (
                <Text variant="small" tone="muted">
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: t.c.card2,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MaterialCommunityIcons name="close" size={17} color={t.c.muted} />
            </Pressable>
          </View>
        ) : null}

        {header}

        <Body
          style={fillHeight ? { flex: 1 } : scroll ? { flexGrow: 0 } : undefined}
          contentContainerStyle={
            scroll ? [{ paddingBottom: t.spacing.lg }, contentStyle] : undefined
          }
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {children}
        </Body>

        {footer ? (
          <View
            style={{
              padding: t.spacing.lg,
              borderTopWidth: 1,
              borderTopColor: t.c.line,
              backgroundColor: t.c.paper,
            }}
          >
            {footer}
          </View>
        ) : null}
      </Animated.View>
    </Modal>
  );
}
