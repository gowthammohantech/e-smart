import React from 'react';
import { Stack } from 'expo-router';
import { ItemForm } from '@/features/catalog/ItemForm';

export default function NewItem() {
  return (
    <>
      <Stack.Screen options={{ title: 'New item' }} />
      <ItemForm />
    </>
  );
}
