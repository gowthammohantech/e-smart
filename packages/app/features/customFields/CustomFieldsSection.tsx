import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { PickerField, SwitchField, TextField } from '@esmart/ui/components/Field';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import type { CustomField, CustomFieldEntity, CustomValues } from '@esmart/core/domain/customFields';
import { useAppStore } from '../../store/appStore';

/** The active company's fields for one kind of record, in their order. */
export function useCustomFields(entity: CustomFieldEntity, includeInactive = false): CustomField[] {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const all = useAppStore((s) => s.customFields);
  return useMemo(
    () =>
      (all ?? [])
        .filter((f) => f.entity === entity && (!f.companyId || f.companyId === companyId) && (includeInactive || (f.status ?? 'active') === 'active'))
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.label.localeCompare(b.label)),
    [all, companyId, entity, includeInactive],
  );
}

/**
 * The company's own fields on a form: each as the input its kind needs. Nothing shows when the company
 * has none. The server checks the values as well (required, numbers, choices).
 */
export function CustomFieldsSection({ entity, values, onChange, errors }: { entity: CustomFieldEntity; values: CustomValues; onChange: (next: CustomValues) => void; errors?: Record<string, string> }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['settings']);
  const fields = useCustomFields(entity);
  const [picking, setPicking] = useState<CustomField | null>(null);
  if (!fields.length) return null;
  const set = (id: string, v: CustomValues[string]) => onChange({ ...values, [id]: v });
  const label = (f: CustomField) => (f.required ? `${f.label} *` : f.label);

  return (
    <View style={{ gap: t.spacing.md }}>
      {fields.map((f) => {
        const v = values[f.id];
        const error = errors?.[f.id];
        switch (f.kind) {
          case 'checkbox':
            return <SwitchField key={f.id} label={f.label} value={v === true} onValueChange={(on) => set(f.id, on)} />;
          case 'date':
            return <DateField key={f.id} label={label(f)} value={typeof v === 'string' ? v : ''} onChange={(d) => set(f.id, d)} />;
          case 'select':
            return <PickerField key={f.id} label={label(f)} value={typeof v === 'string' && v ? v : tr('settings:customFields.choose')} onPress={() => setPicking(f)} error={error} />;
          case 'number':
            return (
              <TextField
                key={f.id}
                label={label(f)}
                value={v === undefined || v === null ? '' : String(v)}
                onChangeText={(text) => set(f.id, text === '' ? null : text)}
                keyboardType="decimal-pad"
                error={error}
              />
            );
          default:
            return <TextField key={f.id} label={label(f)} value={typeof v === 'string' ? v : ''} onChangeText={(text) => set(f.id, text)} error={error} />;
        }
      })}
      <SelectSheet
        visible={!!picking}
        onClose={() => setPicking(null)}
        title={picking?.label ?? ''}
        options={[...(picking?.required ? [] : [{ value: '', label: tr('settings:customFields.none') }]), ...(picking?.options ?? []).map((o) => ({ value: o, label: o }))]}
        value={picking ? (values[picking.id] as string | undefined) ?? '' : ''}
        onSelect={(o) => {
          if (picking) set(picking.id, o || null);
          setPicking(null);
        }}
      />
    </View>
  );
}
