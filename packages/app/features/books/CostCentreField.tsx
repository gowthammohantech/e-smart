import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PickerField } from '@esmart/ui/components/Field';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { useCostCentres } from '../../store/books';

/** Picks a cost centre; shows nothing until the business has one. */
export function CostCentreField({ value, onChange, compact }: { value?: string; onChange: (id: string | undefined) => void; compact?: boolean }) {
  const { t: tr } = useTranslation(['books']);
  const centres = useCostCentres();
  const [open, setOpen] = useState(false);
  if (!centres.length && !value) return null;
  const name = centres.find((c) => c.id === value)?.name;
  return (
    <>
      <PickerField label={compact ? undefined : tr('books:costCentres.field')} value={name ?? (compact ? tr('books:costCentres.field') : tr('books:costCentres.none'))} onPress={() => setOpen(true)} icon="sitemap-outline" />
      <SelectSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={tr('books:costCentres.pick')}
        options={[{ value: '', label: tr('books:costCentres.none') }, ...centres.map((c) => ({ value: c.id, label: c.category ? `${c.name} · ${c.category}` : c.name }))]}
        value={value ?? ''}
        onSelect={(v) => onChange(v || undefined)}
      />
    </>
  );
}
