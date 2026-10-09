import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import type { WebPressState } from '../theme/interaction';
import { Text } from './Text';
import { Button } from './Button';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export type PageAction = { label: string; icon?: IconName; onPress: () => void };

type Slot = { action: PageAction | null; owner: object | null };
type PageActionsValue = { slot: Slot; setSlot: (slot: Slot) => void };

const PageActionsContext = createContext<PageActionsValue | null>(null);

/**
 * Lets the focused screen hand its primary action ("New invoice") to the
 * page header instead of drawing a floating button. Only the desktop web
 * shell provides it; without it, screens keep their own buttons.
 */
export function PageActionsProvider({ children }: { children: React.ReactNode }) {
  const [slot, setSlot] = useState<Slot>({ action: null, owner: null });
  const action = slot.action;

  // "N" anywhere outside a text field runs the page's primary action.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || !action) return undefined;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== 'n') return;
      e.preventDefault();
      action.onPress();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [action]);

  return <PageActionsContext.Provider value={{ slot, setSlot }}>{children}</PageActionsContext.Provider>;
}

/**
 * Offers `action` to the page header while this screen is focused. Returns
 * true when a header will show it, so the caller can skip its own button.
 */
export function usePageAction(action: PageAction | null): boolean {
  const ctx = useContext(PageActionsContext);
  const [owner] = useState(() => ({}));
  const onPress = useRef(action?.onPress);
  useEffect(() => {
    onPress.current = action?.onPress;
  });
  const label = action?.label;
  const icon = action?.icon;
  const setSlot = ctx?.setSlot;

  useFocusEffect(
    useCallback(() => {
      if (!setSlot || !label) return undefined;
      setSlot({ action: { label, icon, onPress: () => onPress.current?.() }, owner });
      return () => setSlot({ action: null, owner: null });
    }, [setSlot, label, icon, owner]),
  );

  return !!ctx && !!action;
}

function useHeaderAction() {
  return useContext(PageActionsContext)?.slot.action ?? null;
}

/** Puts the page title on the browser tab, the way a web app names its pages. */
function useDocumentTitle(title: string) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !title || typeof document === 'undefined') return;
    document.title = `${title} · Elixir Books`;
  }, [title]);
}

/**
 * The desktop page header: a back link to the previous page, the title, and
 * the page's actions on the right, ending with its primary action.
 */
export function PageHeader({
  title,
  subtitle,
  backLabel,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  backLabel?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  const t = useTheme();
  const action = useHeaderAction();
  useDocumentTitle(title);

  return (
    <View
      style={{
        paddingHorizontal: t.spacing.lg,
        paddingTop: t.spacing.xl,
        paddingBottom: t.spacing.lg,
        backgroundColor: t.c.bg,
        gap: t.spacing.xs,
      }}
    >
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="link"
          accessibilityLabel={backLabel ? `Back to ${backLabel}` : 'Back'}
          style={(state) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 2,
            alignSelf: 'flex-start',
            opacity: (state as WebPressState).hovered ? 0.7 : 1,
          })}
        >
          <MaterialCommunityIcons name="chevron-left" size={18} color={t.c.muted} />
          <Text variant="small" tone="muted" weight="600" numberOfLines={1}>
            {backLabel || 'Back'}
          </Text>
        </Pressable>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, minHeight: 40 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="h2" numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="small" tone="muted" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
        {action ? <Button title={action.label} icon={action.icon ?? 'plus'} onPress={action.onPress} /> : null}
      </View>
    </View>
  );
}
