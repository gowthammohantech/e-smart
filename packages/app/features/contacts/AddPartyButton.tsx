import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Button } from '@esmart/ui/components/Button';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';
import type { Party } from '@esmart/core/types';

/**
 * Who is waiting for the contact the new-contact form saves: set when a picker opens the form with
 * ?then=back, called by the form once the contact is saved, then cleared. The saved contact itself
 * comes back, so the picker takes exactly that one, not a guess from the contacts loaded so far
 * (which grow as pickers search, and could hand over someone else).
 */
let waiting: ((party: Party) => void) | null = null;

/** Called by the new-contact form when a contact opened with ?then=back is saved. */
export function partyAdded(party: Party) {
  const take = waiting;
  waiting = null;
  take?.(party);
}

/**
 * "Add new customer" (or supplier) under a contact picker, as the invoice screen has it: the picker
 * closes, the new-contact form opens, and the contact saved there comes back as the one picked.
 */
export function useAddParty(kind: 'customer' | 'supplier', onAdded: (party: Party) => void) {
  const router = useRouter();
  // The latest handler: the form saves after this screen has rendered again.
  const added = useRef(onAdded);
  useEffect(() => {
    added.current = onAdded;
  });
  return (closePicker: () => void) => {
    closePicker();
    waiting = (party) => added.current(party);
    router.push(kind === 'supplier' ? '/(app)/parties/suppliers/new?then=back' : '/(app)/parties/customers/new?then=back');
  };
}

/** The button itself, for a picker's footer. */
export function AddPartyButton({ kind, onPress }: { kind: 'customer' | 'supplier'; onPress: () => void }) {
  const { t: tr } = useTranslation(['sales']);
  const desktop = useIsDesktop();
  return <Button title={tr(kind === 'supplier' ? 'sales:editor.addSupplier' : 'sales:editor.addCustomer')} variant="secondary" icon="plus" fullWidth={!desktop} onPress={onPress} />;
}
