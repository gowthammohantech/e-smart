import React from 'react';
import { Stack } from 'expo-router';
import { PartyForm } from '@/features/contacts/PartyForm';

export default function NewSupplier() {
  return (
    <>
      <Stack.Screen options={{ title: 'New supplier' }} />
      <PartyForm kind="supplier" />
    </>
  );
}
