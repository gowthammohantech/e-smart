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
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { Columns } from '@esmart/ui/components/Layout';
import { Cell, DataTable, TABLE_PAGE_SIZE } from '@esmart/ui/components/DataTable';

export default function Devices() {
  const t = useTheme();
  const desktop = useIsDesktop();
  const { t: tr } = useTranslation(['nav', 'settings', 'common']);
  const { run: serverSave } = useServerSave();

  const devices = useAppStore((s) => s.devices);
  // Empty until the sessions have come, which is not "no devices".
  const ready = useListsReady();
  const revokeDevice = useAppStore((s) => s.revokeDevice);
  const [confirmRevoke, setConfirmRevoke] = useState<DeviceSession | null>(null);

  const lastSeen = (d: DeviceSession) => (d.current ? tr('settings:devices.activeNow') : tr('settings:devices.lastActive', { when: formatRelative(d.lastActiveAt.slice(0, 10)) }));
  const revokeNote = (
    <Card variant="flat">
      <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>{tr('settings:devices.revokeNote')}</Text>
    </Card>
  );
  const keychainNote = (
    <Card variant="flat" style={{ flexDirection: 'row', gap: t.spacing.md }}>
      <Icon name="shield-key-outline" size={19} color={t.c.muted} />
      <Text variant="caption" tone="muted" style={{ flex: 1, lineHeight: 18 }}>{tr('settings:devices.keychainNote')}</Text>
    </Card>
  );

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.devicesAndSessions') }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        {desktop ? (
          // The two notes side by side, then the devices as a table across the page.
          <View style={{ gap: t.spacing.lg }}>
            <Columns left={revokeNote} right={keychainNote} />
            <DataTable
              columns={[
                { key: 'name', header: tr('common:table.name'), flex: 2, render: (d) => <Cell weight="600">{d.label}</Cell> },
                { key: 'type', header: tr('common:table.type'), flex: 2, render: (d) => <Cell tone="muted">{`${d.platform}${d.location ? ` · ${d.location}` : ''}`}</Cell> },
                { key: 'status', header: tr('common:table.status'), flex: 2, render: (d) => <Cell tone="muted">{lastSeen(d)}</Cell> },
                {
                  key: 'action',
                  header: tr('common:table.actions'),
                  width: 140,
                  align: 'right',
                  render: (d) =>
                    d.current ? (
                      // A badge holds itself to the left; this keeps it at the column's right edge.
                      <View style={{ alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'flex-end' }}>
                        <Badge label={tr('settings:devices.thisDevice')} tone="success" size="sm" />
                      </View>
                    ) : (
                      <Cell tone="bad" weight="600">{tr('settings:devices.signOut')}</Cell>
                    ),
                },
              ]}
              rows={devices}
              rowKey={(d) => d.id}
              loading={!ready}
              pageSize={TABLE_PAGE_SIZE}
              onRowPress={(d) => {
                if (!d.current) setConfirmRevoke(d);
              }}
              rowLabel={(d) => `${d.label}, ${lastSeen(d)}`}
              scroll={false}
            />
          </View>
        ) : (
          <>
        <View style={{ marginBottom: t.spacing.lg }}>{revokeNote}</View>

        <Card padded={false}>
          {!ready ? <CardRowsSkeleton kind="list" rows={2} /> : devices.map((d, i) => (
            <ListRow
              key={d.id}
              title={d.label}
              subtitle={`${d.platform}${d.location ? ` · ${d.location}` : ''}`}
              meta={lastSeen(d)}
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

        <View style={{ marginTop: t.spacing.lg }}>{keychainNote}</View>
          </>
        )}
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
