import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Button } from '@esmart/ui/components/Button';
import { ComplianceHub } from '../../../features/compliance/ComplianceHub';

export default function Compliance() {
  const { t: tr } = useTranslation(['compliance', 'nav']);
  const router = useRouter();

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: tr('nav:more.entry.gstCompliance'),
          headerRight: () => (
            <Button
              title={tr('compliance:hub.settings')}
              variant="ghost"
              size="sm"
              icon="cog-outline"
              onPress={() => router.push('/(app)/settings/e-invoicing')}
            />
          ),
        }}
      />
      <ComplianceHub />
    </View>
  );
}
