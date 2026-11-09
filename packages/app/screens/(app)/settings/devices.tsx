import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { Icon } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { ListRow } from '@esmart/ui/components/ListRow';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { useServerSave } from '../../../components/useServerSave';
import { DeviceSession } from '@esmart/core/types';
import { useAppStore } from '../../../store/appStore';
import { useListsReady } from '../../../store/selectors';
import { CardRowsSkeleton } from '../../../components/ScreenSkeleton';
import { formatRelative } from '@esmart/core/lib/date';
import { SHOW_SCROLLBAR, WIDE_FORM_MAX_WIDTH, useIsDesktop } from '@esmart/ui/theme/breakpoints';

export default function Devices() {
  const t = useTheme();
  const desktop = useIsDesktop();
  const { t: tr } = useTranslation(['nav', 'settings']);
  const { run: serverSave } = useServerSave();

  const devices = useAppStore((s) => s.devices);
  // Empty until the sessions have come, which is not "no devices".
  const ready = useListsReady();
  const revokeDevice = useAppStore((s) => s.revokeDevice);
  const [confirmRevoke, setConfirmRevoke] = useState<DeviceSession | null>(null);

  return (
    // A form's width on a desktop, so each switch and value stays near its label.
    <View style={desktop ? { flex: 1, width: '100%', maxWidth: WIDE_FORM_MAX_WIDTH } : { flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.devicesAndSessions') }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Card variant="flat" style={{ marginBottom: t.spacing.lg }}>
          <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>{tr('settings:devices.revokeNote')}</Text>
        </Card>

        <Card padded={false}>
          {!ready ? <CardRowsSkeleton kind="list" rows={2} /> : devices.map((d, i) => (
            <ListRow
              key={d.id}
              title={d.label}
              subtitle={`${d.platform}${d.location ? ` · ${d.location}` : ''}`}
              meta={d.current ? tr('settings:devices.activeNow') : tr('settings:devices.lastActive', { when: formatRelative(d.lastActiveAt.slice(0, 10)) })}
              icon={d.label.toLowerCase().includes('ipad') ? 'tablet' : 'cellphone'}
              divider={i < devices.length - 1}
              right={
                d.current ? (
                  <Badge label={tr('settings:devices.thisDevice')} tone="success" size="sm" />
                ) : (
                  <Text variant="caption" tone="bad" weight="600">{tr('settings:devices.signOut')}</Text>
                )
              }
              onPress={d.current ? undefined : () => setConfirmRevoke(d)}
            />
          ))}
        </Card>

        <Card variant="flat" style={{ marginTop: t.spacing.lg, flexDirection: 'row', gap: t.spacing.md }}>
          <Icon name="shield-key-outline" size={19} color={t.c.muted} />
          <Text variant="caption" tone="muted" style={{ flex: 1, lineHeight: 18 }}>{tr('settings:devices.keychainNote')}</Text>
        </Card>
      </ScrollView>

      <ConfirmDialog
        visible={!!confirmRevoke}
        title={tr('settings:devices.signOutTitle', { name: confirmRevoke?.label })}
        message={tr('settings:devices.signOutMessage')}
        confirmLabel={tr('settings:devices.signOut')}
        destructive
        onCancel={() => setConfirmRevoke(null)}
        onConfirm={() => {
          const d = confirmRevoke;
          setConfirmRevoke(null);
          // "Signed out" only once the server has ended that session.
          if (d) void serverSave(() => revokeDevice(d.id), tr('settings:devices.signedOut'), { icon: 'cellphone-remove', detail: d.label });
        }}
      />
    </View>
  );
}
