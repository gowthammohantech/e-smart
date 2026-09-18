import React from 'react';
import { Stack } from 'expo-router';
import { PartyForm } from '@/features/contacts/PartyForm';

export default function NewCustomer() {
  return (
    <>
      <Stack.Screen options={{ title: 'New customer' }} />
      <PartyForm />
    </>
  );
}
