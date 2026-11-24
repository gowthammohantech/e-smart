import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Button } from '@esmart/ui/components/Button';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';
import type { Party } from '@esmart/core/types';
import { useParties } from '../../store/selectors';

/**
 * "Add new customer" (or supplier) under a contact picker, as the invoice screen has it: the picker
 * closes, the new-contact form opens, and the contact saved there comes back as the one picked.
 */
export function useAddParty(kind: 'customer' | 'supplier', onAdded: (party: Party) => void) {
  const router = useRouter();
  const parties = useParties(kind);
  // The contacts there were before the form opened: the one that wasn't is the one just added.
  const before = useRef<Set<string> | null>(null);
  const added = useRef(onAdded);
  useEffect(() => {
    added.current = onAdded;
  });
  useEffect(() => {
    const was = before.current;
    const party = was && parties.find((p) => !was.has(p.id));
    if (!party) return;
    before.current = null;
    added.current(party);
  }, [parties]);
  return (closePicker: () => void) => {
    closePicker();
    before.current = new Set(parties.map((p) => p.id));
    router.push(kind === 'supplier' ? '/(app)/parties/suppliers/new?then=back' : '/(app)/parties/customers/new?then=back');
  };
}

/** The button itself, for a picker's footer. */
export function AddPartyButton({ kind, onPress }: { kind: 'customer' | 'supplier'; onPress: () => void }) {
  const { t: tr } = useTranslation(['sales']);
  const desktop = useIsDesktop();
  return <Button title={tr(kind === 'supplier' ? 'sales:editor.addSupplier' : 'sales:editor.addCustomer')} variant="secondary" icon="plus" fullWidth={!desktop} onPress={onPress} />;
}
