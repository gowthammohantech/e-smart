import React from 'react';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from '@/components/Button';
import { ComplianceHub } from '@/features/compliance/ComplianceHub';

export default function Compliance() {
  const t = useTheme();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen
        options={{
          title: 'GST compliance',
          headerRight: () => (
            <Button
              title="Settings"
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
