import React from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Modal, Platform, View } from 'react-native';
import * as Application from 'expo-application';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { Text } from '@esmart/ui/components/Text';
import { useUpdateGate } from './updateGateStore';

/** Where to get the new build: the store listing, or TestFlight while iOS is only there. */
function updateUrl(): string {
  const configured = process.env.EXPO_PUBLIC_UPDATE_URL;
  if (configured) return configured;
  if (Platform.OS === 'android') return `market://details?id=${Application.applicationId ?? 'com.elixir.bookssmart'}`;
  return 'itms-beta://';
}

/** Mounted once at the root. Covers everything once the server says this build is too old. */
export function UpdateGate() {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  const minVersion = useUpdateGate((s) => s.minVersion);
  return (
    <Modal visible={minVersion !== null} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: t.spacing.lg }}>
        <Card style={{ gap: t.spacing.md, maxWidth: 420, width: '100%', alignSelf: 'center' }}>
          <Text variant="title" weight="700">
            {tr('common:update.title')}
          </Text>
          <Text variant="small" tone="muted">
            {tr('common:update.body', { version: minVersion ?? '' })}
          </Text>
          {Platform.OS === 'web' ? (
            <Button title={tr('common:update.reload')} onPress={() => window.location.reload()} fullWidth />
          ) : (
            <Button title={tr('common:update.action')} onPress={() => void Linking.openURL(updateUrl())} fullWidth />
          )}
        </Card>
      </View>
    </Modal>
  );
}
