import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Icon, type IconName } from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import type { WebPressState } from '../theme/interaction';
import { Text } from './Text';
import { Button } from './Button';

/** Where a header button sits in the window: a menu it opens drops down from here. */
export type PageActionAnchor = { x: number; y: number; width: number; height: number };

export type PageAction = {
  label: string;
  icon?: IconName;
  /**
   * Gets the header button's place when it was pressed, so the action can open a Menu under it
   * (e.g. "Create" with a list of things to make). Nothing when it ran from its "N" shortcut.
   */
  onPress: (anchor?: PageActionAnchor) => unknown;
  /** Working: the button spins and can't be pressed again. */
  loading?: boolean;
  /** "N" runs it. Off for an action that commits something, like raising an e-way bill. */
  shortcut?: boolean;
  /** A Ctrl/⌘ letter the screen also runs it with (e.g. "S"), shown on the button. */
  keyHint?: string;
  /** Shown above the button on hover, e.g. why the action is locked on this plan. */
  tooltip?: string;
};

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
    if (Platform.OS !== 'web' || typeof document === 'undefined' || !action || action.shortcut === false) return undefined;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== 'n') return;
      e.preventDefault();
      // Held down, or while it is already running: once.
      if (e.repeat || action.loading) return;
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
  const onPress = useRef<PageAction['onPress'] | undefined>(action?.onPress);
  useEffect(() => {
    onPress.current = action?.onPress;
  });
  const label = action?.label;
  const icon = action?.icon;
  const loading = action?.loading;
  const shortcut = action?.shortcut;
  const keyHint = action?.keyHint;
  const tooltip = action?.tooltip;
  const setSlot = ctx?.setSlot;

  useFocusEffect(
    useCallback(() => {
      if (!setSlot || !label) return undefined;
      setSlot({ action: { label, icon, loading, shortcut, keyHint, tooltip, onPress: (anchor) => onPress.current?.(anchor) }, owner });
      return () => setSlot({ action: null, owner: null });
    }, [setSlot, label, icon, loading, shortcut, keyHint, tooltip, owner]),
  );

  return !!ctx && !!action;
}

function useHeaderAction() {
  return useContext(PageActionsContext)?.slot.action ?? null;
}

/** The page's primary action, measured as it is pressed so a menu can open from it. */
function HeaderActionButton({ action }: { action: PageAction }) {
  const [node, setNode] = useState<View | null>(null);
  // The header is a desktop browser's, so the button is an element to read at once; a callback
  // measure would hand back a promise and flash the button's spinner.
  const press = () => {
    const box = (node as unknown as HTMLElement | null)?.getBoundingClientRect?.();
    return action.onPress(box ? { x: box.left, y: box.top, width: box.width, height: box.height } : undefined);
  };
  return (
    <View ref={setNode} collapsable={false}>
      <Button title={action.label} icon={action.icon ?? 'plus'} onPress={press} loading={action.loading} shortcut={action.keyHint} tooltip={action.tooltip} />
    </View>
  );
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
  const { t: tr } = useTranslation(['common']);
  const action = useHeaderAction();
  useDocumentTitle(title);

  return (
    <View
      style={{
        paddingHorizontal: t.spacing.lg,
        paddingTop: t.spacing.xxl,
        paddingBottom: t.spacing.lg,
        backgroundColor: t.c.bg,
        gap: t.spacing.xs,
      }}
    >
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="link"
          accessibilityLabel={backLabel ? tr('common:component.backTo', { label: backLabel }) : tr('common:action.back')}
          style={(state) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 2,
            alignSelf: 'flex-start',
            opacity: (state as WebPressState).hovered ? 0.7 : 1,
          })}
        >
          <Icon name="chevron-left" size={16} color={t.c.muted} />
          <Text variant="small" tone="muted" weight="500" numberOfLines={1}>
            {backLabel || tr('common:action.back')}
          </Text>
        </Pressable>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, minHeight: 40 }}>
        <View style={{ flex: 1, gap: t.spacing.xs }}>
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
        {action ? <HeaderActionButton action={action} /> : null}
      </View>
    </View>
  );
}
