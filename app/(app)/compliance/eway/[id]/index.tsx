import React from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { EmptyState } from '@/components/EmptyState';
import { EwayBillDetail } from '@/features/compliance/EwayBillDetail';
import { useEwayBill } from '@/store/selectors';

export default function EwayBillScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const bill = useEwayBill(id);

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: bill ? 'E-way bill' : 'Not found' }} />
      {bill ? (
        <EwayBillDetail bill={bill} />
      ) : (
        <EmptyState
          illustration="not-found"
          title="E-way bill not found"
          message="It may have been removed, or it belongs to another business."
        />
      )}
    </View>
  );
}
