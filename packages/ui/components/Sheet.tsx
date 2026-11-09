import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  Keyboard,
  KeyboardEvent,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { DRAWER_WIDTH, FORM_MAX_WIDTH, useIsDesktop } from '../theme/breakpoints';
import { Text } from './Text';
import { ToastProvider } from './Toast';

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
  /**
   * Show toasts raised from inside the sheet over it. The app's own toasts
   * draw under the Modal, so a message about the open sheet would be hidden.
   * Keep it fixed while the sheet is open: changing it rebuilds the sheet,
   * which stops its slide-in where it is.
   */
  ownToasts?: boolean;
  /**
   * How it opens in a desktop browser: a centred `dialog` (the default; a confirmation, a short
   * form) or a `drawer` down the right edge, full height (a picker, a line editor, a record form),
   * which keeps the page it was opened from in view. A phone always gets the bottom sheet.
   */
  desktopAs?: 'dialog' | 'drawer';
  /** Desktop width: a dialog defaults to 520, a drawer to 480. */
  desktopWidth?: number;
};

/**
 * Bottom sheet built on the platform Modal so it behaves natively on both
 * platforms without pulling in a gesture library. In a desktop browser it is
 * a centred dialog, or a right-side drawer (`desktopAs`), instead;
 * react-native-web's Modal closes it on Escape and keeps focus inside. There
 * the footer's buttons line up at the right, as a desktop dialog's do.
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
  ownToasts = false,
  desktopAs = 'dialog',
  desktopWidth,
}: Props) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  const insets = useSafeAreaInsets();
  const desktop = useIsDesktop();
  const drawer = desktop && desktopAs === 'drawer';
  const dialog = desktop && !drawer;
  // Read live, so the sheet follows a resized browser window.
  const window = useWindowDimensions();
  // Lazy state rather than a ref, so the animated values are never read
  // during render. Slides up on a phone, in from the right as a drawer.
  const [translate] = useState(() => new Animated.Value(700));
  const [fade] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (visible) {
      const enter = Animated.parallel([
        Animated.spring(translate, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 240 }),
        Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]);
      enter.start();
      // A second run while this one is still going (the sheet re-rendered as it opened) must stop
      // this one first: stopping it later stops the shared values, freezing the new run mid-slide.
      return () => enter.stop();
    } else {
      translate.setValue(700);
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

  const windowHeight = window.height;
  const maxHeight = Math.min(
    windowHeight * maxHeightRatio,
    windowHeight - keyboardHeight - insets.top - t.spacing.md,
  );
  const Body = scroll ? ScrollView : View;

  const drawerWidth = Math.min(desktopWidth ?? DRAWER_WIDTH.md, window.width - t.spacing.xxl);
  const panelStyle: StyleProp<ViewStyle> = drawer
    ? {
        position: 'absolute',
        top: 0,
        bottom: 0,
        right: 0,
        width: drawerWidth,
        backgroundColor: t.c.paper,
        borderLeftWidth: 1,
        borderColor: t.c.line,
        transform: [{ translateX: translate }],
      }
    : dialog
    ? {
        width: '100%',
        maxWidth: desktopWidth ?? FORM_MAX_WIDTH,
        maxHeight,
        height: fillHeight ? maxHeight : undefined,
        backgroundColor: t.c.paper,
        borderRadius: t.radius.xl,
        borderWidth: t.scheme === 'dark' ? 1 : 0,
        borderColor: t.c.line,
        overflow: 'hidden',
        opacity: fade,
      }
    : {
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
      };

  const content = (
    <>
      <Animated.View style={{ flex: 1, backgroundColor: t.c.overlay, opacity: fade }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel={tr('common:component.close')} accessibilityRole="button" />
      </Animated.View>

      <View
        pointerEvents="box-none"
        style={
          dialog
            ? [StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', padding: t.spacing.xl }]
            : StyleSheet.absoluteFill
        }
      >
        <Animated.View style={[panelStyle, t.shadow.sheet]}>
          {drawer ? null : dialog ? (
            <View style={{ height: t.spacing.sm }} />
          ) : (
            <View style={{ alignItems: 'center', paddingTop: t.spacing.sm }}>
              <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: t.c.line }} />
            </View>
          )}

          {title ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: t.spacing.lg,
                paddingTop: drawer ? t.spacing.lg : t.spacing.md,
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
                accessibilityLabel={tr('common:component.close')}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: t.c.card2,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="close" size={17} color={t.c.muted} />
              </Pressable>
            </View>
          ) : null}

          {header}

          <Body
            // A drawer is full height whatever it holds; its footer stays at the bottom.
            style={fillHeight || drawer ? { flex: 1 } : scroll ? { flexGrow: 0 } : undefined}
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
              style={[
                {
                  padding: t.spacing.lg,
                  borderTopWidth: 1,
                  borderTopColor: t.c.line,
                  backgroundColor: t.c.paper,
                },
                // A desktop dialog's buttons sit at the right at their own width, not as a phone's full-width bar.
                desktop ? { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: t.spacing.sm } : null,
              ]}
            >
              {footer}
            </View>
          ) : null}
        </Animated.View>
      </View>
    </>
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {ownToasts ? <ToastProvider>{content}</ToastProvider> : content}
    </Modal>
  );
}
