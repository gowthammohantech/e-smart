import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { DocumentListView } from '@/components/DocumentListView';
import { Fab } from '@/components/Fab';
import { useDocuments } from '@/store/selectors';

export default function DeliveryList() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav']);
  const router = useRouter();
  const documents = useDocuments('delivery');

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.deliveryNotes') }} />
      <DocumentListView
        documents={documents}
        kind="delivery"
        routeFor={(d) => `/(app)/sales/deliveries/${d.id}`}
        emptyAction={tr('nav:title.newDeliveryNote')}
        onEmptyAction={() => router.push('/(app)/sales/deliveries/new')}
      />
      <Fab icon="plus" onPress={() => router.push('/(app)/sales/deliveries/new')} />
    </View>
  );
}
