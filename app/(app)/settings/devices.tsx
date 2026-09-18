import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { ListRow } from '@/components/ListRow';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { DeviceSession } from '@/types';
import { useAppStore } from '@/store/appStore';
import { formatRelative } from '@/lib/date';

export default function Devices() {
  const t = useTheme();
  const toast = useToast();

  const devices = useAppStore((s) => s.devices);
  const revokeDevice = useAppStore((s) => s.revokeDevice);
  const [confirmRevoke, setConfirmRevoke] = useState<DeviceSession | null>(null);

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: 'Devices & sessions' }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Card variant="flat" style={{ marginBottom: t.spacing.lg }}>
          <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
            Signing a device out revokes its session immediately — it cannot keep using the app with a cached token.
          </Text>
        </Card>

        <Card padded={false}>
          {devices.map((d, i) => (
            <ListRow
              key={d.id}
              title={d.label}
              subtitle={`${d.platform}${d.location ? ` · ${d.location}` : ''}`}
              meta={d.current ? 'Active now' : `Last active ${formatRelative(d.lastActiveAt.slice(0, 10))}`}
              icon={d.label.toLowerCase().includes('ipad') ? 'tablet' : 'cellphone'}
              divider={i < devices.length - 1}
              right={
                d.current ? (
                  <Badge label="This device" tone="success" size="sm" />
                ) : (
                  <Text variant="caption" tone="bad" weight="600">
                    Sign out
                  </Text>
                )
              }
              onPress={d.current ? undefined : () => setConfirmRevoke(d)}
            />
          ))}
        </Card>

        <Card variant="flat" style={{ marginTop: t.spacing.lg, flexDirection: 'row', gap: t.spacing.md }}>
          <MaterialCommunityIcons name="shield-key-outline" size={19} color={t.c.muted} />
          <Text variant="caption" tone="muted" style={{ flex: 1, lineHeight: 18 }}>
            Session tokens are held in the platform keychain, never in plain storage.
          </Text>
        </Card>
      </ScrollView>

      <ConfirmDialog
        visible={!!confirmRevoke}
        title={`Sign out ${confirmRevoke?.label}?`}
        message="That device will need to sign in again to reach your books."
        confirmLabel="Sign out"
        destructive
        onCancel={() => setConfirmRevoke(null)}
        onConfirm={() => {
          if (confirmRevoke) revokeDevice(confirmRevoke.id);
          setConfirmRevoke(null);
          toast.show('Device signed out', 'success');
        }}
      />
    </View>
  );
}
