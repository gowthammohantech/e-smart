import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon, type IconName } from '@esmart/ui/components/Icon';
import { readableOn } from '@esmart/ui/theme/contrast';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { Text } from '@esmart/ui/components/Text';
import { Avatar } from '@esmart/ui/components/Avatar';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { Menu, MenuDivider, MenuItem, useMenuAnchor } from '@esmart/ui/components/Menu';
import { countLabel } from '@esmart/core/lib/format';
import { formatRelative } from '@esmart/core/lib/date';
import { useAppStore } from '@esmart/app/store/appStore';
import { ConnectionBadge } from '@esmart/app/components/ConnectionBadge';
import { DemoChip } from '@esmart/app/components/DemoChip';
import { useBranches, useCurrentUser, useNotifications, useUnreadCount } from '@esmart/app/store/selectors';
import { LIXI, LixiMark } from '@esmart/ui/components/LixiOrb';
import { toggleLixiPanel, useLixiPanel } from '../lixiPanel';
import { useSignOut } from '@esmart/app/features/session/useSignOut';
import { NOTIFICATION_META, notificationRoute } from '@esmart/app/features/notifications/notificationMeta';
import { CommandPalette } from './CommandPalette';
import { LatencyBadge } from './LatencyBadge';
import { BranchPicker, CompanyPicker } from './CompanySwitcher';
import { useBreakpoint } from '@esmart/ui/theme/breakpoints';
import { SETTINGS_HREF } from '@esmart/app/navigation/pages';
import { appHref } from '@esmart/app/navigation/menu';

export const TOP_BAR_HEIGHT = 56;

// Room each side needs to show names in full: the business (240) and branch (200)
// pickers on the left; sync, response time, Lixi, the bell and the avatar on the right.
const LEFT_FULL = 448;
const LEFT_NO_BRANCH = 240;
const RIGHT_FULL = 340;
const SEARCH_MAX = 480;
const SEARCH_MIN = 220;

/** Mac shows ⌘K; Windows and Linux use Ctrl K. */
const IS_MAC =
  Platform.OS === 'web' && typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');

const IconButton = React.forwardRef<
  View,
  { icon: IconName; label: string; onPress: () => void; badge?: number }
>(function IconButton({ icon, label, onPress, badge }, ref) {
  const t = useTheme();
  return (
    <Pressable
      ref={ref}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={(state) => {
        const { pressed, hovered, focused } = state as WebPressState;
        return [
          {
            width: 36,
            height: 36,
            borderRadius: t.radius.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed || hovered ? t.c.card2 : 'transparent',
          },
          focusRing(t, focused),
        ];
      }}
    >
      <Icon name={icon} size={18} color={t.c.muted} />
      {badge ? (
        <View
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            borderWidth: 2,
            borderColor: t.c.paper,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            paddingHorizontal: 4,
            backgroundColor: t.c.bad,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="micro" tone="onPrimary" weight="600" style={{ fontSize: 9 }}>
            {countLabel(badge)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
});

/** Opens and closes the Lixi side panel; lit while it is open. */
function LixiButton({ label }: { label: string }) {
  const t = useTheme();
  const { open } = useLixiPanel();
  return (
    <Pressable
      onPress={toggleLixiPanel}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: open }}
      style={(state) => {
        const { pressed, hovered, focused } = state as WebPressState;
        return [
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            height: 36,
            paddingLeft: 6,
            paddingRight: 12,
            borderRadius: t.radius.md,
            backgroundColor: open || pressed || hovered ? t.c.chip : 'transparent',
          },
          focusRing(t, focused),
        ];
      }}
    >
      <LixiMark size={22} />
      {/* Lixi's own blue, lightened in dark mode until it reads on the bar (3.1:1 as is). */}
      <Text variant="small" weight="600" style={{ color: readableOn(LIXI.blue, t.c.paper, t.c.text) }}>
        Lixi
      </Text>
    </Pressable>
  );
}

/**
 * The desktop app's top bar, in three parts: the business and branch you're
 * in on the left (each its own picker), search (⌘K) in the middle, and sync
 * state, server response time, Lixi, notifications and your account on the right. The two sides
 * share the leftover width equally, so search stays centred on the bar.
 */
export function TopBar() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav', 'common']);
  const router = useRouter();

  const user = useCurrentUser();
  const notifications = useNotifications();
  const unread = useUnreadCount();
  const markRead = useAppStore((s) => s.markNotificationRead);
  const markAllRead = useAppStore((s) => s.markAllNotificationsRead);
  const signOut = useSignOut();

  const { setAnchor: bellAnchor, rect: bellRect, open: openBellMenu, close: closeBellMenu } = useMenuAnchor();
  const { setAnchor: accountAnchor, rect: accountRect, open: openAccountMenu, close: closeAccountMenu } = useMenuAnchor();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  // ⌘K / Ctrl+K anywhere, or "/" outside a text field, opens search.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const go = (route: string) => router.push(route as never);
  const hasBranches = useBranches().length > 0;
  // The bar's own width, not the window's: the Lixi panel and the sidebar both take from it.
  const [barWidth, setBarWidth] = useState(0);
  const tablet = useBreakpoint() === 'tablet';
  const pad = tablet ? t.spacing.lg : t.spacing.xxl;
  const inner = barWidth - 2 * pad - 2 * t.spacing.md;
  const left = hasBranches ? LEFT_FULL : LEFT_NO_BRANCH;
  // Three layouts, roomiest first: search centred between equal sides; search
  // between sides sized to what they hold; or (a tablet window, or the Lixi panel
  // open on a small screen) just the logo and branch mark, so search keeps its room.
  const centred = barWidth > 0 && inner - 2 * Math.max(left, RIGHT_FULL) >= SEARCH_MIN + 120;
  const narrow = tablet || (barWidth > 0 && inner - (left + RIGHT_FULL) < SEARCH_MIN);
  const sideStyle = centred ? { flex: 1, flexBasis: 0 } : null;

  return (
    <View
      role="banner"
      onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
      style={{
        height: TOP_BAR_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.md,
        paddingHorizontal: pad,
        backgroundColor: t.c.paper,
        borderBottomWidth: 1,
        borderBottomColor: t.c.line,
      }}
    >
      <View style={[{ flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }, sideStyle]}>
        <CompanyPicker compact={narrow} />
        <BranchPicker compact={narrow} />
      </View>

      <Pressable
        onPress={() => setPaletteOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={tr('nav:shell.searchPlaceholder')}
        {...({ 'aria-keyshortcuts': IS_MAC ? 'Meta+K' : 'Control+K' } as object)}
        style={(state) => {
          const { hovered, focused } = state as WebPressState;
          return [
            {
              width: SEARCH_MAX,
              flexShrink: 1,
              minWidth: narrow ? 160 : SEARCH_MIN,
              height: 36,
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing.sm,
              paddingHorizontal: t.spacing.md,
              borderRadius: t.radius.md,
              borderWidth: 1,
              borderColor: hovered ? t.c.lineStrong : t.c.line,
              backgroundColor: t.c.card2,
            },
            focusRing(t, focused),
          ];
        }}
      >
        <Icon name="magnify" size={16} color={t.c.muted} />
        <Text variant="small" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
          {tr('nav:shell.searchPlaceholder')}
        </Text>
        <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, borderWidth: 1, borderColor: t.c.line, backgroundColor: t.c.card }}>
          <Text variant="micro" tone="muted" weight="500">
            {IS_MAC ? tr('nav:shell.searchShortcut') : 'Ctrl K'}
          </Text>
        </View>
      </Pressable>

      <View
        style={[
          { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: t.spacing.sm },
          // When room is short the buttons keep their size and the search box gives way,
          // so they never spill left over it.
          narrow ? { flexGrow: 1, flexShrink: 0 } : { flex: 1, flexBasis: 0, minWidth: centred ? 0 : RIGHT_FULL },
        ]}
      >
      <ConnectionBadge style={{ alignSelf: 'center' }} />
      {narrow ? null : <LatencyBadge />}
      <DemoChip />

      <LixiButton label={tr('nav:more.entry.askLixi')} />
      <IconButton
        ref={bellAnchor}
        icon="bell-outline"
        label={unread > 0 ? tr('nav:tabBadgeA11y', { label: tr('nav:shell.notifications'), count: unread }) : tr('nav:shell.notifications')}
        onPress={openBellMenu}
        badge={unread}
      />

      <Pressable
        ref={accountAnchor}
        onPress={openAccountMenu}
        accessibilityRole="button"
        accessibilityLabel={tr('nav:shell.account')}
        style={(state) => [{ borderRadius: 18, opacity: (state as WebPressState).hovered ? 0.85 : 1 }, focusRing(t, (state as WebPressState).focused)]}
      >
        <Avatar name={user?.name ?? '?'} size={30} color={user?.avatarColor} />
      </Pressable>
      </View>

      <Menu anchor={bellRect} onClose={closeBellMenu} align="right" width={380}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.sm }}>
          <Text variant="body" weight="600" style={{ flex: 1 }}>
            {tr('nav:shell.notifications')}
          </Text>
          {unread > 0 ? (
            // A menu item, so the arrow keys and Tab reach it like the rest of the menu.
            <Pressable
              onPress={markAllRead}
              accessibilityRole="menuitem"
              style={(state) => {
                const { hovered, focused } = state as WebPressState;
                return [
                  { paddingHorizontal: t.spacing.sm, paddingVertical: 4, borderRadius: t.radius.sm, backgroundColor: hovered ? t.c.card2 : 'transparent' },
                  focusRing(t, focused),
                ];
              }}
            >
              <Text variant="small" tone="primary" weight="600">
                {tr('common:notifications.markAllRead')}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <MenuDivider />
        {notifications.length === 0 ? (
          <Text variant="small" tone="muted" style={{ padding: t.spacing.lg }}>
            {tr('nav:shell.allCaughtUp')}
          </Text>
        ) : (
          notifications.slice(0, 8).map((n) => (
            <MenuItem
              key={n.id}
              icon={NOTIFICATION_META[n.kind].icon}
              label={n.title}
              description={`${n.body} · ${formatRelative(n.createdAt)}`}
              trailing={n.read ? null : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.c.primary }} />}
              onPress={() => {
                markRead(n.id);
                closeBellMenu();
                const route = notificationRoute(n.entityType, n.entityId);
                if (route) go(route);
              }}
            />
          ))
        )}
        <MenuDivider />
        <MenuItem
          icon="arrow-right"
          label={tr('nav:shell.viewAll')}
          onPress={() => {
            closeBellMenu();
            go('/(app)/notifications');
          }}
        />
      </Menu>

      <Menu anchor={accountRect} onClose={closeAccountMenu} align="right" width={260}>
        <View style={{ paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.sm, gap: 2 }}>
          <Text variant="small" weight="600" numberOfLines={1}>
            {user?.name}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {user?.email}
          </Text>
        </View>
        <MenuDivider />
        {(
          [
            ['account-circle-outline', 'nav:title.yourProfile', '/(app)/settings/profile'],
            ['star-circle-outline', 'nav:more.entry.planAndBilling', '/(app)/settings/plan'],
            ['palette-outline', 'nav:more.entry.appearanceAndLanguage', '/(app)/settings/appearance'],
            ['cog-outline', 'nav:shell.allSettings', appHref(SETTINGS_HREF)],
          ] as const
        ).map(([icon, key, route]) => (
          <MenuItem
            key={route}
            icon={icon}
            label={tr(key)}
            onPress={() => {
              closeAccountMenu();
              go(route);
            }}
          />
        ))}
        <MenuDivider />
        <MenuItem
          icon="logout"
          label={tr('nav:more.signOut.row')}
          destructive
          onPress={() => {
            closeAccountMenu();
            setConfirmSignOut(true);
          }}
        />
      </Menu>

      {paletteOpen ? <CommandPalette onClose={() => setPaletteOpen(false)} /> : null}

      <ConfirmDialog
        visible={confirmSignOut}
        title={tr('nav:more.signOut.title')}
        message={tr('nav:more.signOut.message')}
        confirmLabel={tr('nav:more.signOut.confirm')}
        destructive
        icon="logout"
        onCancel={() => setConfirmSignOut(false)}
        onConfirm={() => {
          setConfirmSignOut(false);
          signOut();
        }}
      />
    </View>
  );
}
