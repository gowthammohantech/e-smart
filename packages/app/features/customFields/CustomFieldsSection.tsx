import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Text } from '@esmart/ui/components/Text';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { PickerField, SwitchField, TextField } from '@esmart/ui/components/Field';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { checkCustomValues, type CustomField, type CustomFieldEntity, type CustomValues } from '@esmart/core/domain/customFields';
import { SkeletonFormField, SkeletonGroup } from '@esmart/ui/components/Skeleton';
import { FieldRow } from '@esmart/ui/components/Layout';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { useAppStore } from '../../store/appStore';
import { useSetupReady } from '../../store/selectors';

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
 * What is wrong with the values, by field id, in the person's language: the server's own checks
 * (required, numbers, dates, choices), so a form can show them on the fields before it saves.
 */
export function customFieldErrors(fields: CustomField[], entity: CustomFieldEntity, values: CustomValues | undefined, tr: (key: never, options: never) => unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of checkCustomValues(fields, entity, values ?? {}).problems) {
    const f = fields.find((x) => x.id === p.fieldId);
    if (!f) continue;
    const v = values?.[f.id];
    const missing = v === undefined || v === null || v === '';
    const key = missing ? 'required' : f.kind === 'number' || f.kind === 'date' || f.kind === 'select' ? f.kind : 'text';
    out[f.id] = String(tr(`settings:customFields.errors.${key}` as never, { label: f.label } as never));
  }
  return out;
}

/**
 * The company's own fields on a form: each as the input its kind needs. Nothing shows when the company
 * has none. The server checks the values as well (required, numbers, choices).
 */
export function CustomFieldsSection({ entity, values, onChange, errors }: { entity: CustomFieldEntity; values: CustomValues; onChange: (next: CustomValues) => void; errors?: Record<string, string> }) {
  const t = useTheme();
  const desktop = useIsDesktop();
  const { t: tr } = useTranslation(['settings']);
  const fields = useCustomFields(entity);
  const setupReady = useSetupReady();
  const [picking, setPicking] = useState<CustomField | null>(null);
  // The business's fields come with its setup: until then a placeholder, so a required one isn't missed.
  if (!fields.length && !setupReady) {
    return (
      <SkeletonGroup style={{ gap: t.spacing.md }}>
        <SkeletonFormField index={0} />
        <SkeletonFormField index={1} />
      </SkeletonGroup>
    );
  }
  if (!fields.length) return null;
  const set = (id: string, v: CustomValues[string]) => onChange({ ...values, [id]: v });

  return (
    <View style={{ gap: t.spacing.md }}>
      {pairs(desktop, fields.map((f) => {
        const v = values[f.id];
        const error = errors?.[f.id];
        switch (f.kind) {
          case 'checkbox':
            // A tick box is never missing (unticked is an answer), so it carries no required mark.
            return (
              <View key={f.id} style={{ gap: 4 }}>
                <SwitchField label={f.label} value={v === true} onValueChange={(on) => set(f.id, on)} />
                {error ? (
                  <Text variant="caption" tone="bad">
                    {error}
                  </Text>
                ) : null}
              </View>
            );
          case 'date':
            return <DateField key={f.id} label={f.label} required={f.required} value={typeof v === 'string' ? v : ''} onChange={(d) => set(f.id, d)} error={error} />;
          case 'select':
            // Nothing chosen shows the placeholder, not "Choose" as if it were the value.
            return <PickerField key={f.id} label={f.label} required={f.required} value={typeof v === 'string' && v ? v : undefined} placeholder={tr('settings:customFields.choose')} onPress={() => setPicking(f)} error={error} />;
          case 'number':
            return (
              <TextField
                key={f.id}
                label={f.label}
                required={f.required}
                value={v === undefined || v === null ? '' : String(v)}
                onChangeText={(text) => set(f.id, text === '' ? null : text)}
                keyboardType="decimal-pad"
                error={error}
              />
            );
          default:
            return <TextField key={f.id} label={f.label} required={f.required} value={typeof v === 'string' ? v : ''} onChangeText={(text) => set(f.id, text)} error={error} />;
        }
      }))}
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

/**
 * On a desktop the fields go two to a row, so a short value isn't a box the width of the form and a
 * tick box's switch sits near its label. A phone keeps one per row.
 */
function pairs(desktop: boolean, nodes: React.ReactElement[]): React.ReactNode {
  if (!desktop) return nodes;
  const rows: React.ReactNode[] = [];
  for (let i = 0; i < nodes.length; i += 2) {
    rows.push(
      <FieldRow key={String(nodes[i].key)} columns={2}>
        {nodes[i]}
        {nodes[i + 1] ?? null}
      </FieldRow>,
    );
  }
  return rows;
}
