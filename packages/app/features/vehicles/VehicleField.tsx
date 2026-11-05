import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PickerField } from '@esmart/ui/components/Field';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { useVehicles } from '../../store/selectors';

/** Picks one of the business's vehicles; shows nothing until it has one. */
export function VehicleField({ value, onChange }: { value?: string; onChange: (id: string | undefined) => void }) {
  const { t: tr } = useTranslation(['settings']);
  const vehicles = useVehicles();
  const [open, setOpen] = useState(false);
  if (!vehicles.length && !value) return null;
  const picked = vehicles.find((v) => v.id === value);
  return (
    <>
      <PickerField
        label={tr('settings:vehicles.field')}
        value={picked ? [picked.registration, picked.name].filter(Boolean).join(' · ') : tr('settings:vehicles.none')}
        onPress={() => setOpen(true)}
        icon="truck-outline"
      />
      <SelectSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={tr('settings:vehicles.field')}
        options={[{ value: '', label: tr('settings:vehicles.none') }, ...vehicles.map((v) => ({ value: v.id, label: v.registration, description: v.name }))]}
        value={value ?? ''}
        onSelect={(v) => onChange(v || undefined)}
      />
    </>
  );
}
