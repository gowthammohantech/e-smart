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
import { useToast } from '@esmart/ui/components/Toast';
import { DeviceSession } from '@esmart/core/types';
import { useAppStore } from '../../../store/appStore';
import { formatRelative } from '@esmart/core/lib/date';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';

export default function Devices() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav', 'settings']);
  const toast = useToast();

  const devices = useAppStore((s) => s.devices);
  const revokeDevice = useAppStore((s) => s.revokeDevice);
  const [confirmRevoke, setConfirmRevoke] = useState<DeviceSession | null>(null);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.devicesAndSessions') }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Card variant="flat" style={{ marginBottom: t.spacing.lg }}>
          <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>{tr('settings:devices.revokeNote')}</Text>
        </Card>

        <Card padded={false}>
          {devices.map((d, i) => (
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
          if (confirmRevoke) revokeDevice(confirmRevoke.id);
          setConfirmRevoke(null);
          toast.show(tr('settings:devices.signedOut'), 'success', { icon: 'cellphone-remove', detail: confirmRevoke?.label });
        }}
      />
    </View>
  );
}
