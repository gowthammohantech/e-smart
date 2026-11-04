import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Linking, Platform, ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Button } from '@esmart/ui/components/Button';
import { SwitchField } from '@esmart/ui/components/Field';
import { useToast } from '@esmart/ui/components/Toast';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { api } from '../../../remote/api';
import { describeError } from '../../../remote/errors';
import { ensurePushRegistered, pushPermission, type PushPermission } from '../../../remote/push';

/** The kinds a person can mute, in the order they matter to a business. */
const KINDS = ['paymentReceived', 'invoiceOverdue', 'compliance', 'lowStock', 'system'] as const;
type Kind = (typeof KINDS)[number];

/** Which notifications this phone shows. Everything still appears in the app's notification list. */
export default function NotificationSettings() {
  const t = useTheme();
  const { t: tr } = useTranslation(['settings', 'nav']);
  const toast = useToast();
  const [permission, setPermission] = useState<PushPermission>('undetermined');
  const [muted, setMuted] = useState<string[] | null>(null);

  const refresh = useCallback(() => void pushPermission().then(setPermission), []);
  useEffect(() => {
    refresh();
    // Back from the phone's settings: the permission may have changed there.
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);
  useEffect(() => {
    api.GET('/me/notification-preferences').then(
      ({ data }) => setMuted(data?.pushMuted ?? []),
      (err: unknown) => toast.show(describeError(err, tr), 'error'),
    );
  }, [toast, tr]);

  const toggle = (kind: Kind, on: boolean) => {
    if (!muted) return;
    const next = on ? muted.filter((k) => k !== kind) : [...muted, kind];
    setMuted(next);
    api.PUT('/me/notification-preferences', { body: { pushMuted: next as never } }).catch((err: unknown) => {
      setMuted(muted);
      toast.show(describeError(err, tr), 'error');
    });
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.notifications') }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40, gap: t.spacing.lg }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        {permission !== 'granted' ? (
          <Card style={{ gap: t.spacing.sm }}>
            <Text variant="body" weight="600">
              {tr(permission === 'unavailable' ? 'settings:notifications.unavailableTitle' : 'settings:notifications.offTitle')}
            </Text>
            <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
              {tr(permission === 'unavailable' ? (Platform.OS === 'web' ? 'settings:notifications.web' : 'settings:notifications.unavailable') : permission === 'denied' ? 'settings:notifications.denied' : 'settings:notifications.off')}
            </Text>
            {permission === 'undetermined' ? <Button title={tr('settings:notifications.turnOn')} onPress={() => void ensurePushRegistered({ ask: true }).then(refresh)} /> : null}
            {permission === 'denied' ? <Button title={tr('settings:notifications.openSettings')} variant="secondary" onPress={() => void Linking.openSettings()} /> : null}
          </Card>
        ) : null}
        <Card style={{ gap: t.spacing.md }}>
          {KINDS.map((kind) => (
            <SwitchField key={kind} label={tr(`settings:notifications.kind.${kind}`)} value={!!muted && !muted.includes(kind)} onValueChange={(on) => toggle(kind, on)} />
          ))}
        </Card>
        <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
          {tr('settings:notifications.inApp')}
        </Text>
      </ScrollView>
    </View>
  );
}
