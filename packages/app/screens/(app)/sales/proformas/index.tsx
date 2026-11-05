import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { DocumentListView } from '../../../../components/DocumentListView';
import { Fab } from '@esmart/ui/components/Fab';

export default function ProformaList() {
  const { t: tr } = useTranslation(['nav']);
  const router = useRouter();

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.proformas') }} />
      <DocumentListView
        kind="proforma"
        routeFor={(d) => `/(app)/sales/proformas/${d.id}`}
        emptyAction={tr('nav:title.newProforma')}
        onEmptyAction={() => router.push('/(app)/sales/proformas/new')}
      />
      <Fab icon="plus" onPress={() => router.push('/(app)/sales/proformas/new')} />
    </View>
  );
}
