import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { Text } from '@esmart/ui/components/Text';
import { Avatar } from '@esmart/ui/components/Avatar';
import { Badge } from '@esmart/ui/components/Badge';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { Menu, MenuDivider, MenuItem, MenuSection, useMenuAnchor } from '@esmart/ui/components/Menu';
import { countLabel } from '@esmart/core/lib/format';
import { formatRelative } from '@esmart/core/lib/date';
import { useAppStore } from '@esmart/app/store/appStore';
import { useUiStore } from '@esmart/app/store/uiStore';
import { isRemote, useRemoteMeta } from '@esmart/app/remote';
import { useActiveCompany, useBranches, useCurrentUser, useNotifications, useUnreadCount } from '@esmart/app/store/selectors';
import { openLixi } from '@esmart/app/features/lixi/open';
import { useSignOut } from '@esmart/app/features/session/useSignOut';
import { NOTIFICATION_META, notificationRoute } from '@esmart/app/features/notifications/notificationMeta';
import { CommandPalette } from './CommandPalette';

export const TOP_BAR_HEIGHT = 60;

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

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
            width: 38,
            height: 38,
            borderRadius: t.radius.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed || hovered ? t.c.card2 : 'transparent',
          },
          focusRing(t, focused),
        ];
      }}
    >
      <MaterialCommunityIcons name={icon} size={20} color={t.c.text} />
      {badge ? (
        <View
          style={{
            position: 'absolute',
            top: 3,
            right: 3,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            paddingHorizontal: 4,
            backgroundColor: t.c.bad,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="micro" tone="onPrimary" weight="700" style={{ fontSize: 9 }}>
            {countLabel(badge)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
});

/**
 * The desktop app's top bar: which business and branch you're in, search
 * (⌘K), sync state, Lixi, notifications and your account.
 */
export function TopBar() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav', 'common', 'onboarding']);
  const router = useRouter();

  const company = useActiveCompany();
  const companies = useAppStore((s) => s.companies);
  const branches = useBranches();
  const activeBranchId = useAppStore((s) => s.activeBranchId);
  const setActiveCompany = useAppStore((s) => s.setActiveCompany);
  const setActiveBranch = useAppStore((s) => s.setActiveBranch);
  const user = useCurrentUser();
  const notifications = useNotifications();
  const unread = useUnreadCount();
  const markRead = useAppStore((s) => s.markNotificationRead);
  const markAllRead = useAppStore((s) => s.markAllNotificationsRead);
  const signOut = useSignOut();

  const simulatedOffline = useUiStore((s) => s.offlineMode);
  const online = useRemoteMeta((m) => m.online);
  const offline = isRemote() ? !online : simulatedOffline;
  const pendingSync = useAppStore((s) => s.syncQueue.filter((q) => q.status !== 'synced').length);

  const { setAnchor: companyAnchor, rect: companyRect, open: openCompanyMenu, close: closeCompanyMenu } = useMenuAnchor();
  const { setAnchor: bellAnchor, rect: bellRect, open: openBellMenu, close: closeBellMenu } = useMenuAnchor();
  const { setAnchor: accountAnchor, rect: accountRect, open: openAccountMenu, close: closeAccountMenu } = useMenuAnchor();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const branch = branches.find((b) => b.id === activeBranchId);

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
        gap: t.spacing.md,
        paddingHorizontal: t.spacing.lg,
        backgroundColor: t.c.paper,
        borderBottomWidth: 1,
        borderBottomColor: t.c.line,
      }}
    >
      <Pressable
        ref={companyAnchor}
        onPress={openCompanyMenu}
        accessibilityRole="button"
        accessibilityLabel={`${tr('common:business.switch')}: ${company?.name ?? ''}`}
        style={(state) => {
          const { hovered, focused } = state as WebPressState;
          return [
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing.sm,
              paddingVertical: 6,
              paddingHorizontal: t.spacing.sm,
              borderRadius: t.radius.md,
              maxWidth: 280,
              backgroundColor: hovered ? t.c.card2 : 'transparent',
            },
            focusRing(t, focused),
          ];
        }}
      >
        <Avatar name={company?.name ?? '?'} size={30} />
        <View style={{ flexShrink: 1 }}>
          <Text variant="small" weight="700" numberOfLines={1}>
            {company?.name ?? tr('common:component.business')}
          </Text>
          <Text variant="micro" tone="muted" numberOfLines={1}>
            {branch?.name ?? tr('common:component.allBranches')} · {company?.baseCurrency}
          </Text>
        </View>
        <MaterialCommunityIcons name="unfold-more-horizontal" size={16} color={t.c.muted} />
      </Pressable>

      <Pressable
        onPress={() => setPaletteOpen(true)}
        accessibilityRole="search"
        accessibilityLabel={tr('nav:shell.searchPlaceholder')}
        style={(state) => {
          const { hovered, focused } = state as WebPressState;
          return [
            {
              flex: 1,
              maxWidth: 520,
              height: 38,
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing.sm,
              paddingHorizontal: t.spacing.md,
              borderRadius: t.radius.md,
              borderWidth: 1,
              borderColor: hovered ? t.c.muted : t.c.line,
              backgroundColor: t.c.bg,
            },
            focusRing(t, focused),
          ];
        }}
      >
        <MaterialCommunityIcons name="magnify" size={18} color={t.c.muted} />
        <Text variant="small" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
          {tr('nav:shell.searchPlaceholder')}
        </Text>
        <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: t.c.line }}>
          <Text variant="micro" tone="muted" weight="700">
            {tr('nav:shell.searchShortcut')}
          </Text>
        </View>
      </Pressable>

      <View style={{ flex: 1 }} />

      {offline ? <Badge label={tr('common:component.offline')} tone="warning" icon="cloud-off-outline" size="sm" style={{ alignSelf: 'center' }} /> : null}
      {!offline && pendingSync > 0 ? <Badge label={`${countLabel(pendingSync)} queued`} tone="info" icon="sync" size="sm" style={{ alignSelf: 'center' }} /> : null}

      <IconButton icon="creation-outline" label={tr('nav:more.entry.askLixi')} onPress={() => openLixi()} />
      <IconButton ref={bellAnchor} icon="bell-outline" label={tr('nav:shell.notifications')} onPress={openBellMenu} badge={unread} />

      <Pressable
        ref={accountAnchor}
        onPress={openAccountMenu}
        accessibilityRole="button"
        accessibilityLabel={tr('nav:shell.account')}
        style={(state) => [{ borderRadius: 18, opacity: (state as WebPressState).hovered ? 0.85 : 1 }, focusRing(t, (state as WebPressState).focused)]}
      >
        <Avatar name={user?.name ?? '?'} size={34} color={user?.avatarColor} />
      </Pressable>

      <Menu anchor={companyRect} onClose={closeCompanyMenu} width={300}>
        <MenuSection title={tr('nav:shell.businesses')} />
        {companies.map((c) => (
          <MenuItem
            key={c.id}
            icon="domain"
            label={c.name}
            description={`${tr(`onboarding:businessType.${c.businessType}` as 'onboarding:businessType.other')} · ${c.baseCurrency}`}
            selected={c.id === company?.id}
            onPress={() => {
              setActiveCompany(c.id);
              closeCompanyMenu();
            }}
          />
        ))}
        {branches.length > 0 ? (
          <>
            <MenuDivider />
            <MenuSection title={tr('nav:shell.branches')} />
            {branches.map((b) => (
              <MenuItem
                key={b.id}
                icon={b.isPrimary ? 'office-building-outline' : 'warehouse'}
                label={b.name}
                description={b.code}
                selected={b.id === activeBranchId}
                onPress={() => {
                  setActiveBranch(b.id);
                  closeCompanyMenu();
                }}
              />
            ))}
          </>
        ) : null}
        <MenuDivider />
        <MenuItem
          icon="cog-outline"
          label={tr('nav:more.entry.businessProfile')}
          onPress={() => {
            closeCompanyMenu();
            go('/(app)/settings/company');
          }}
        />
      </Menu>

      <Menu anchor={bellRect} onClose={closeBellMenu} align="right" width={380}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.sm }}>
          <Text variant="body" weight="700" style={{ flex: 1 }}>
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
          <Text variant="small" weight="700" numberOfLines={1}>
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
