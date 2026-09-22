import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleProp, ViewStyle } from 'react-native';
import { PickerField } from '@/components/Field';
import { SelectOption, SelectSheet } from '@/components/pickers/SelectSheet';
import { allCities, citiesForState } from '@/data/cities';
import { stateName } from '@/data/masters';

/**
 * City picker scoped to the state chosen alongside it. The list is curated,
 * not exhaustive, so whatever the user types in the search box can be kept
 * as-is — nobody is blocked on a town the list doesn't know.
 */
export function CityField({
  label,
  value,
  onChange,
  stateCode,
  placeholder,
  required,
  error,
  hint,
  containerStyle,
}: {
  label?: string;
  value: string;
  onChange: (city: string) => void;
  /** GST state code; without one, every city is offered with its state beside it. */
  stateCode?: string;
  placeholder?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  const { t: tr } = useTranslation(['common']);
  const [open, setOpen] = useState(false);

  const options = useMemo<SelectOption[]>(() => {
    let list: SelectOption[];
    if (stateCode) {
      list = citiesForState(stateCode).map((c) => ({ value: c, label: c }));
    } else {
      // A few names exist in more than one state, so group them into one row.
      const byName = new Map<string, string[]>();
      for (const c of allCities()) byName.set(c.name, [...(byName.get(c.name) ?? []), stateName(c.stateCode)]);
      list = [...byName].map(([name, states]) => ({ value: name, label: name, description: states.join(', ') }));
    }
    // Keep a saved city the list doesn't know — a typed-in town, or an older record.
    const current = value.trim();
    if (current && !list.some((o) => o.value === current)) list = [{ value: current, label: current }, ...list];
    return list;
  }, [stateCode, value]);

  return (
    <>
      <PickerField
        label={label ?? tr('common:component.city')}
        value={value || undefined}
        placeholder={placeholder ?? tr('common:component.selectCity')}
        onPress={() => setOpen(true)}
        required={required}
        error={error}
        hint={hint}
        containerStyle={containerStyle}
      />
      <SelectSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={label ?? tr('common:component.city')}
        subtitle={stateCode ? stateName(stateCode) : tr('common:component.allStates')}
        options={options}
        value={value}
        onSelect={onChange}
        onCreate={onChange}
        searchPlaceholder={tr('common:component.searchCity')}
      />
    </>
  );
}
