import React, { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { focusRing, type WebPressState } from '../theme/interaction';
import { Text } from './Text';

type Rect = { x: number; y: number; width: number; height: number };

/**
 * Holds the button a menu opens from. Pass `setAnchor` as the button's ref and call
 * `open` from its onPress; the menu drops down from wherever it sits.
 */
export function useMenuAnchor() {
  // A callback ref kept in state, so nothing reads a ref during render.
  const [node, setAnchor] = useState<View | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const open = useCallback(() => {
    node?.measureInWindow((x, y, width, height) => setRect({ x, y, width, height }));
  }, [node]);
  const close = useCallback(() => setRect(null), []);
  return { setAnchor, rect, open, close, visible: rect !== null };
}

/**
 * A dropdown panel under an anchor, for desktop menus (account, company,
 * notifications). Escape or a click outside closes it.
 */
export function Menu({
  anchor,
  onClose,
  align = 'left',
  width = 280,
  maxHeight = 480,
  children,
}: {
  anchor: Rect | null;
  onClose: () => void;
  align?: 'left' | 'right';
  width?: number;
  maxHeight?: number;
  children: React.ReactNode;
}) {
  const t = useTheme();
  const window = useWindowDimensions();
  if (!anchor) return null;

  const top = anchor.y + anchor.height + 6;
  const position =
    align === 'right'
      ? { right: Math.max(window.width - (anchor.x + anchor.width), 8) }
      : { left: Math.min(anchor.x, window.width - width - 8) };

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu" />
      <View
        style={[
          {
            position: 'absolute',
            top,
            ...position,
            width,
            maxHeight: Math.min(maxHeight, window.height - top - 16),
            backgroundColor: t.c.paper,
            borderRadius: t.radius.md,
            borderWidth: 1,
            borderColor: t.c.line,
            overflow: 'hidden',
          },
          t.shadow.sheet,
        ]}
      >
        <ScrollView contentContainerStyle={{ paddingVertical: t.spacing.xs }}>{children}</ScrollView>
      </View>
    </Modal>
  );
}

export function MenuItem({
  icon,
  label,
  description,
  selected,
  destructive,
  trailing,
  onPress,
}: {
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  description?: string;
  selected?: boolean;
  destructive?: boolean;
  trailing?: React.ReactNode;
  onPress: () => void;
}) {
  const t = useTheme();
  const color = destructive ? t.c.bad : t.c.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="menuitem"
      accessibilityState={{ selected }}
      style={(state) => {
        const { pressed, hovered, focused } = state as WebPressState;
        return [
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.md,
            paddingHorizontal: t.spacing.md,
            paddingVertical: description ? t.spacing.sm : 9,
            marginHorizontal: t.spacing.xs,
            borderRadius: t.radius.sm,
            backgroundColor: pressed || hovered ? t.c.card2 : 'transparent',
          },
          focusRing(t, focused),
        ];
      }}
    >
      {icon ? <MaterialCommunityIcons name={icon} size={18} color={destructive ? t.c.bad : t.c.muted} /> : null}
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="small" weight={selected ? '700' : '500'} numberOfLines={1} style={{ color }}>
          {label}
        </Text>
        {description ? (
          <Text variant="caption" tone="muted" numberOfLines={2}>
            {description}
          </Text>
        ) : null}
      </View>
      {trailing}
      {selected ? <MaterialCommunityIcons name="check" size={16} color={t.c.primary} /> : null}
    </Pressable>
  );
}

export function MenuSection({ title }: { title: string }) {
  const t = useTheme();
  return (
    <Text
      variant="micro"
      tone="muted"
      weight="700"
      style={{ textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.sm, paddingBottom: 4 }}
    >
      {title}
    </Text>
  );
}

export function MenuDivider() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.c.line, marginVertical: t.spacing.xs }} />;
}
