import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Badge } from '@esmart/ui/components/Badge';
import { PrimaryActionBar } from '@esmart/ui/components/ActionBar';
import { Card } from '@esmart/ui/components/Card';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { Segmented, SwitchField, TextField } from '@esmart/ui/components/Field';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Sheet } from '@esmart/ui/components/Sheet';
import { Text } from '@esmart/ui/components/Text';
import { FormContainer } from '@esmart/ui/components/Layout';
import { DRAWER_WIDTH, SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { uid } from '@esmart/core/lib/id';
import type { CustomField, CustomFieldEntity, CustomFieldKind } from '@esmart/core/domain/customFields';
import { useServerSave } from '../../../components/useServerSave';
import { useAppStore } from '../../../store/appStore';
import { useCustomFields } from '../../../features/customFields/CustomFieldsSection';
import { SheetActions } from '../../../features/company/SheetActions';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ENTITIES: CustomFieldEntity[] = ['party', 'item', 'document'];
const KINDS: CustomFieldKind[] = ['text', 'number', 'date', 'select', 'checkbox'];

/** The company's own fields: what each kind of record asks for besides the usual, and what prints. */
export default function CustomFieldsScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const desktop = useIsDesktop();
  const { t: tr } = useTranslation(['settings']);
  const [entity, setEntity] = useState<CustomFieldEntity>('document');
  const fields = useCustomFields(entity, true);
  const companyId = useAppStore((s) => s.activeCompanyId);
  const saveField = useAppStore((s) => s.saveCustomField);
  const removeField = useAppStore((s) => s.removeCustomField);
  const { run: serverSave, saving } = useServerSave();
  const [editing, setEditing] = useState<CustomField | null>(null);
  const [options, setOptions] = useState('');
  const [deleting, setDeleting] = useState<CustomField | null>(null);

  const open = (f?: CustomField) => {
    const next: CustomField = f ?? { id: uid('cfd'), companyId, entity, label: '', kind: 'text', options: [], required: false, showOnPdf: entity === 'document', position: fields.length, status: 'active' };
    setEditing(next);
    setOptions((next.options ?? []).join(', '));
  };
  const isNew = editing ? !fields.some((f) => f.id === editing.id) : false;
  const save = async () => {
    if (!editing) return;
    const record = { ...editing, label: editing.label.trim(), options: editing.kind === 'select' ? options.split(',').map((o) => o.trim()).filter(Boolean) : [] };
    const res = await serverSave(() => saveField(record), tr('settings:customFields.saved'), { icon: 'text-box-check-outline', detail: record.label });
    if (res) setEditing(null);
  };

  return (
    <FormContainer wide>
      <Stack.Screen options={{ title: tr('settings:customFields.title') }} />
      {/* The add button sits in the page header on a desktop, so no room is kept for a bottom bar. */}
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: desktop ? t.spacing.xxl : 120 + insets.bottom, gap: t.spacing.lg }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Text variant="small" tone="muted">
          {tr('settings:customFields.hint')}
        </Text>
        <Segmented options={ENTITIES.map((e) => ({ value: e, label: tr(`settings:customFields.entity.${e}`) }))} value={entity} onChange={(v) => setEntity(v as CustomFieldEntity)} />
        {fields.length ? (
          <Card padded={false}>
            {fields.map((f, i) => (
              <ListRow
                key={f.id}
                title={f.label}
                subtitle={[tr(`settings:customFields.kind.${f.kind}`), f.required ? tr('settings:customFields.required') : '', f.showOnPdf ? tr('settings:customFields.printed') : ''].filter(Boolean).join(' · ')}
                right={f.status === 'inactive' ? <Badge label={tr('settings:customFields.inactive')} tone="neutral" size="sm" /> : undefined}
                chevron
                divider={i < fields.length - 1}
                onPress={() => open(f)}
              />
            ))}
          </Card>
        ) : (
          <Text variant="small" tone="muted">
            {tr('settings:customFields.empty')}
          </Text>
        )}
      </ScrollView>

      <PrimaryActionBar title={tr('settings:customFields.add')} icon="plus" onPress={() => open()} />

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        // A drawer on a desktop: wide enough for the five field kinds side by side.
        desktopAs="drawer"
        desktopWidth={DRAWER_WIDTH.lg}
        title={isNew ? tr('settings:customFields.add') : (editing?.label ?? '')}
        footer={
          editing ? (
            <SheetActions
              saveLabel={tr('settings:customFields.save')}
              onSave={save}
              saving={saving}
              saveDisabled={!editing.label.trim()}
              deleteLabel={tr('settings:customFields.delete')}
              onDelete={
                isNew
                  ? undefined
                  : () => {
                      setDeleting(editing);
                      setEditing(null);
                    }
              }
            />
          ) : undefined
        }
      >
        {editing ? (
          <View style={{ padding: t.spacing.lg, gap: t.spacing.md }}>
            <TextField label={tr('settings:customFields.label')} value={editing.label} onChangeText={(label) => setEditing({ ...editing, label })} maxLength={60} />
            {isNew ? (
              <Segmented options={KINDS.map((k) => ({ value: k, label: tr(`settings:customFields.kind.${k}`) }))} value={editing.kind} onChange={(v) => setEditing({ ...editing, kind: v as CustomFieldKind })} />
            ) : (
              <Text variant="caption" tone="muted">
                {tr('settings:customFields.kindFixed', { kind: tr(`settings:customFields.kind.${editing.kind}`) })}
              </Text>
            )}
            {editing.kind === 'select' ? <TextField label={tr('settings:customFields.options')} value={options} onChangeText={setOptions} hint={tr('settings:customFields.optionsHint')} /> : null}
            {editing.kind !== 'checkbox' ? <SwitchField label={tr('settings:customFields.required')} value={!!editing.required} onValueChange={(required) => setEditing({ ...editing, required })} /> : null}
            {editing.entity !== 'item' ? (
              <SwitchField label={tr('settings:customFields.printed')} description={tr(`settings:customFields.printHint.${editing.entity}`)} value={!!editing.showOnPdf} onValueChange={(showOnPdf) => setEditing({ ...editing, showOnPdf })} />
            ) : null}
            {!isNew ? (
              <SwitchField label={tr('settings:customFields.active')} description={tr('settings:customFields.activeHint')} value={(editing.status ?? 'active') === 'active'} onValueChange={(on) => setEditing({ ...editing, status: on ? 'active' : 'inactive' })} />
            ) : null}
          </View>
        ) : null}
      </Sheet>
      <ConfirmDialog
        visible={!!deleting}
        title={tr('settings:customFields.deleteTitle', { label: deleting?.label ?? '' })}
        message={tr('settings:customFields.deleteMessage')}
        confirmLabel={tr('settings:customFields.delete')}
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          const f = deleting!;
          setDeleting(null);
          await serverSave(() => removeField(f.id), tr('settings:customFields.deleted'), { icon: 'delete-outline', detail: f.label });
        }}
      />
    </FormContainer>
  );
}
