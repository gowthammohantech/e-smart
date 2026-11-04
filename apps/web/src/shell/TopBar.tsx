import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon, type IconName } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { Text } from '@esmart/ui/components/Text';
import { Avatar } from '@esmart/ui/components/Avatar';
import { Badge } from '@esmart/ui/components/Badge';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { Menu, MenuDivider, MenuItem, useMenuAnchor } from '@esmart/ui/components/Menu';
import { countLabel } from '@esmart/core/lib/format';
import { formatRelative } from '@esmart/core/lib/date';
import { useAppStore } from '@esmart/app/store/appStore';
import { carriesQueue, ConnectionBadge } from '@esmart/app/components/ConnectionBadge';
import { useConnectivity } from '@esmart/app/remote';
import { useCurrentUser, useNotifications, useUnreadCount } from '@esmart/app/store/selectors';
import { LIXI, LixiMark } from '@esmart/ui/components/LixiOrb';
import { toggleLixiPanel, useLixiPanel } from '../lixiPanel';
import { useSignOut } from '@esmart/app/features/session/useSignOut';
import { NOTIFICATION_META, notificationRoute } from '@esmart/app/features/notifications/notificationMeta';
import { CommandPalette } from './CommandPalette';

export const TOP_BAR_HEIGHT = 56;

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
      <Text variant="small" weight="600" style={{ color: LIXI.blue }}>
        Lixi
      </Text>
    </Pressable>
  );
}

/**
 * The desktop app's top bar: search (⌘K), sync state, Lixi, notifications
 * and your account. The business switcher lives at the top of the sidebar.
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

  const pendingSync = useAppStore((s) => s.syncQueue.filter((q) => q.status === 'pending').length);
  const failedSync = useAppStore((s) => s.syncQueue.filter((q) => q.status === 'failed').length);
  const mode = useConnectivity((s) => s.mode);
  const showQueued = pendingSync > 0 && !carriesQueue(mode);

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

  return (
    <View
      style={{
        height: TOP_BAR_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.sm,
        paddingHorizontal: t.spacing.xxl,
        backgroundColor: t.c.paper,
        borderBottomWidth: 1,
        borderBottomColor: t.c.line,
      }}
    >
      <Pressable
        onPress={() => setPaletteOpen(true)}
        accessibilityRole="search"
        accessibilityLabel={tr('nav:shell.searchPlaceholder')}
        style={(state) => {
          const { hovered, focused } = state as WebPressState;
          return [
            {
              flex: 1,
              maxWidth: 480,
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
            {tr('nav:shell.searchShortcut')}
          </Text>
        </View>
      </Pressable>

      <View style={{ flex: 1 }} />

      <ConnectionBadge style={{ alignSelf: 'center' }} />
      {/* Failed or queued changes open the sync page, where each can be retried or discarded. */}
      {failedSync > 0 || showQueued ? (
        <Pressable
          onPress={() => router.push('/(app)/settings/sync')}
          accessibilityRole="button"
          accessibilityLabel={tr('common:component.openSyncStatus')}
          style={(state) => [{ flexDirection: 'row', gap: t.spacing.xs, alignSelf: 'center', borderRadius: 999, opacity: (state as WebPressState).hovered ? 0.85 : 1 }, focusRing(t, (state as WebPressState).focused)]}
        >
          {failedSync > 0 ? <Badge label={tr('common:component.failedSync', { count: failedSync })} tone="danger" icon="cloud-alert" size="sm" /> : null}
          {showQueued ? <Badge label={tr('common:component.queuedSync', { count: countLabel(pendingSync) })} tone="info" icon="sync" size="sm" /> : null}
        </Pressable>
      ) : null}

      <LixiButton label={tr('nav:more.entry.askLixi')} />
      <IconButton ref={bellAnchor} icon="bell-outline" label={tr('nav:shell.notifications')} onPress={openBellMenu} badge={unread} />

      <Pressable
        ref={accountAnchor}
        onPress={openAccountMenu}
        accessibilityRole="button"
        accessibilityLabel={tr('nav:shell.account')}
        style={(state) => [{ borderRadius: 18, opacity: (state as WebPressState).hovered ? 0.85 : 1 }, focusRing(t, (state as WebPressState).focused)]}
      >
        <Avatar name={user?.name ?? '?'} size={30} color={user?.avatarColor} />
      </Pressable>

      <Menu anchor={bellRect} onClose={closeBellMenu} align="right" width={380}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.sm }}>
          <Text variant="body" weight="600" style={{ flex: 1 }}>
            {tr('nav:shell.notifications')}
          </Text>
          {unread > 0 ? (
            <Text variant="small" tone="primary" weight="600" accessibilityRole="button" onPress={markAllRead}>
              {tr('common:notifications.markAllRead')}
            </Text>
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
            ['cog-outline', 'nav:shell.allSettings', '/(app)/(tabs)/more'],
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
