import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { Segmented } from '@esmart/ui/components/Field';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { useAppStore } from '../../store/appStore';
import { useNotifications } from '../../store/selectors';
import { NOTIFICATION_META, notificationRoute } from '../../features/notifications/notificationMeta';
import { formatRelative } from '@esmart/core/lib/date';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import type { AppNotification } from '@esmart/core/types';


export default function Notifications() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation(['common']);
  const router = useRouter();
  // Always false in the native apps, so the desktop layout only ever reaches a browser.
  const desktop = useIsDesktop();

  const notifications = useNotifications();
  const markRead = useAppStore((s) => s.markNotificationRead);
  const markAllRead = useAppStore((s) => s.markAllNotificationsRead);
  const clearAll = useAppStore((s) => s.clearNotifications);

  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [confirmClear, setConfirmClear] = useState(false);

  const rows = useMemo(
    () => (filter === 'unread' ? notifications.filter((n) => !n.read) : notifications),
    [notifications, filter],
  );
  const unread = notifications.filter((n) => !n.read).length;


  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen
        options={{
          title: 'Notifications',
          headerRight: desktop
            ? () => (
                // A desktop keeps the page actions together, top right, instead of a bar at the bottom.
                <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
                  {unread > 0 ? (
                    <Button title={tr('common:notifications.markAllRead')} variant="ghost" icon="check-all" onPress={markAllRead} />
                  ) : null}
                  {notifications.length > 0 ? (
                    <Button title={tr('common:notifications.clearAll')} variant="ghost" icon="notification-clear-all" onPress={() => setConfirmClear(true)} />
                  ) : null}
                </View>
              )
            : () =>
                unread > 0 ? (
                  <Pressable onPress={markAllRead} hitSlop={8} accessibilityRole="button" accessibilityLabel={tr('common:notifications.markAllRead')}>
                    <Text variant="small" tone="primary" weight="600">{tr('common:notifications.markAllRead')}</Text>
                  </Pressable>
                ) : null,
        }}
      />

      {/* A desktop keeps the filter compact at the left rather than stretched across the page. */}
      <View
        style={
          desktop
            ? { paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, width: 360 }
            : { paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md }
        }
      >
        <Segmented
          options={[
            { value: 'all', label: `All (${notifications.length})` },
            { value: 'unread', label: `Unread (${unread})` },
          ]}
          value={filter}
          onChange={(v) => setFilter(v as 'all' | 'unread')}
          size="sm"
        />
      </View>

      <ScrollView
        // No bottom bar to clear on a desktop.
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: desktop ? t.spacing.xxxl : 120 + insets.bottom }}
        showsVerticalScrollIndicator={SHOW_SCROLLBAR}
      >
        {rows.length === 0 ? (
          <Card padded={false}>
            <EmptyState
              illustration="no-notifications" icon="bell-check-outline"
              title={filter === 'unread' ? 'Nothing unread' : 'No notifications'}
              message={tr('common:notifications.emptyBody')}
              compact
            />
          </Card>
        ) : (
          <Card padded={false}>
            {rows.map((n, i) => {
              const meta = NOTIFICATION_META[n.kind];
              const route = notificationRoute(n.entityType, n.entityId);
              return (
                <Pressable
                  key={n.id}
                  onPress={() => {
                    markRead(n.id);
                    if (route) router.push(route as never);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={n.title}
                  style={(state) => {
                    const { pressed, hovered, focused } = state as WebPressState;
                    return {
                      flexDirection: 'row',
                      gap: t.spacing.md,
                      padding: t.spacing.lg,
                      borderBottomWidth: i < rows.length - 1 ? 0.5 : 0,
                      borderBottomColor: t.c.line,
                      backgroundColor: pressed || (desktop && hovered) ? t.c.card2 : n.read ? 'transparent' : t.c.chip,
                      // A desktop row is one line: icon, text, then the time at the far right.
                      ...(desktop ? { alignItems: 'center' as const, ...focusRing(t, focused) } : {}),
                    };
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor:
                        meta.tone === 'danger'
                          ? t.c.badSoft
                          : meta.tone === 'success'
                            ? t.c.goodSoft
                            : meta.tone === 'warning'
                              ? t.c.warnSoft
                              : t.c.mutedSoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <MaterialCommunityIcons
                      name={meta.icon}
                      size={18}
                      color={
                        meta.tone === 'danger'
                          ? t.c.bad
                          : meta.tone === 'success'
                            ? t.c.good
                            : meta.tone === 'warning'
                              ? t.c.warn
                              : t.c.muted
                      }
                    />
                  </View>
                  {desktop ? (
                    <DesktopRowText n={n} />
                  ) : (
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text variant="body" weight={n.read ? '500' : '700'} style={{ flex: 1 }} numberOfLines={1}>
                          {n.title}
                        </Text>
                        {!n.read ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: t.c.primary }} /> : null}
                      </View>
                      <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
                        {n.body}
                      </Text>
                      <Text variant="micro" tone="muted">
                        {formatRelative(n.createdAt.slice(0, 10))}
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </Card>
        )}

        <View style={{ height: t.spacing.lg }} />
        <Badge label={tr('common:notifications.deliveryNote')} tone="neutral" />
      </ScrollView>

      {/* On a desktop, Clear all sits in the header instead. */}
      {notifications.length > 0 && !desktop ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: t.spacing.lg,
            paddingBottom: insets.bottom + t.spacing.md,
            borderTopWidth: 1,
            borderTopColor: t.c.line,
            backgroundColor: t.c.paper,
          }}
        >
          <Button title={tr('common:notifications.clearAll')} variant="ghost" icon="notification-clear-all" onPress={() => setConfirmClear(true)} fullWidth />
        </View>
      ) : null}

      <ConfirmDialog
        visible={confirmClear}
        title={tr('common:notifications.clearTitle')}
        message={tr('common:notifications.clearMessageFull')}
        confirmLabel={tr('common:notifications.clear')}
        destructive
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          clearAll();
          setConfirmClear(false);
        }}
      />
    </View>
  );
}

/** A notification's text on one desktop row: title and body, then when it arrived at the far right. */
function DesktopRowText({ n }: { n: AppNotification }) {
  const t = useTheme();
  return (
    <>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="body" weight={n.read ? '500' : '700'} numberOfLines={1}>
          {n.title}
        </Text>
        <Text variant="small" tone="muted" numberOfLines={2}>
          {n.body}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
        <Text variant="caption" tone="muted">
          {formatRelative(n.createdAt.slice(0, 10))}
        </Text>
        {/* The dot keeps its place when read, so the times stay in one column. */}
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: n.read ? 'transparent' : t.c.primary }} />
      </View>
    </>
  );
}
