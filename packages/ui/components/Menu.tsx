import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { focusRing, type WebPressState } from '../theme/interaction';
import { Text } from './Text';

type Rect = { x: number; y: number; width: number; height: number };

const WEB = Platform.OS === 'web';

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
  // Focus goes back to the button the menu opened from, so a keyboard user carries on from there.
  const close = useCallback(() => {
    setRect(null);
    if (WEB) (node as unknown as HTMLElement | null)?.focus?.();
  }, [node]);
  return { setAnchor, rect, open, close, visible: rect !== null };
}

/** The menu items inside a panel, in order, skipping any that are disabled. */
function itemsIn(panel: HTMLElement | null): HTMLElement[] {
  return panel ? Array.from(panel.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')) : [];
}

/**
 * A dropdown panel under an anchor, for desktop menus (account, company,
 * notifications, a table row's actions). Escape or a click outside closes
 * it. On the web it is an ARIA menu: focus starts on the first item, and the
 * arrow keys, Home and End move between items.
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
  const { t: tr } = useTranslation(['common']);
  const window = useWindowDimensions();
  const panel = useRef<View>(null);
  const opened = anchor !== null;

  useEffect(() => {
    if (!WEB || !opened) return;
    // A frame after mount, once the items are in the DOM.
    const id = requestAnimationFrame(() => itemsIn(panel.current as unknown as HTMLElement)[0]?.focus());
    return () => cancelAnimationFrame(id);
  }, [opened]);

  if (!anchor) return null;

  const onKeyDown = (e: { key: string; preventDefault: () => void }) => {
    const items = itemsIn(panel.current as unknown as HTMLElement);
    if (!items.length) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => {
      e.preventDefault();
      items[(i + items.length) % items.length].focus();
    };
    if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at < 0 ? items.length - 1 : at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else if (e.key === 'Tab') {
      // Tab leaves a menu rather than walking it.
      e.preventDefault();
      onClose();
    }
  };

  const top = anchor.y + anchor.height + 6;
  const position =
    align === 'right'
      ? { right: Math.max(window.width - (anchor.x + anchor.width), 8) }
      : { left: Math.min(anchor.x, window.width - width - 8) };

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={tr('common:component.closeMenu')} />
      <View
        ref={panel}
        role="menu"
        {...(WEB ? ({ onKeyDown } as object) : null)}
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
  leading,
  label,
  description,
  selected,
  destructive,
  trailing,
  onPress,
}: {
  icon?: IconName;
  /** Drawn where the icon goes, in its place: e.g. a business's logo. */
  leading?: React.ReactNode;
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
      {leading ?? (icon ? <Icon name={icon} size={18} color={destructive ? t.c.bad : t.c.muted} /> : null)}
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
      {selected ? <Icon name="check" size={16} color={t.c.primary} /> : null}
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
