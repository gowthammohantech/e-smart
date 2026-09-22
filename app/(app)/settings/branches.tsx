import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ListRow } from '@/components/ListRow';
import { Sheet } from '@/components/Sheet';
import { PickerField, TextField, SwitchField } from '@/components/Field';
import { SelectSheet } from '@/components/pickers/SelectSheet';
import { CityField } from '@/components/pickers/CityField';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { Branch } from '@/types';
import { useAppStore } from '@/store/appStore';
import { useActiveCompany, useBranches, useDocuments } from '@/store/selectors';
import { uid } from '@/lib/id';
import { INDIAN_STATES, stateName } from '@/data/masters';
import { citiesForState } from '@/data/cities';

export default function BranchSettings() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav', 'settings']);
  const toast = useToast();

  const company = useActiveCompany();
  const branches = useBranches();
  const documents = useDocuments();
  const saveBranch = useAppStore((s) => s.saveBranch);
  const removeBranch = useAppStore((s) => s.removeBranch);

  const [editing, setEditing] = useState<Branch | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Branch | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [city, setCity] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [stateOpen, setStateOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);

  const open = (branch?: Branch) => {
    setEditing(branch ?? ({ id: '', companyId: company.id, name: '', code: '', address: company.address, isPrimary: false } as Branch));
    setName(branch?.name ?? '');
    setCode(branch?.code ?? '');
    setCity(branch?.address.city ?? company.address.city);
    setStateCode(branch?.address.stateCode ?? company.address.stateCode ?? '');
    setPhone(branch?.phone ?? '');
    setIsPrimary(branch?.isPrimary ?? false);
  };

  const save = () => {
    if (!editing || !name.trim()) return;
    saveBranch({
      ...editing,
      id: editing.id || uid('brn'),
      companyId: company.id,
      name: name.trim(),
      code: (code || name.slice(0, 3)).toUpperCase(),
      phone: phone.trim() || undefined,
      isPrimary,
      address: {
        ...editing.address,
        // Head office's city is only a sensible default for a branch in the same state.
        city: city.trim() || (stateCode === company.address.stateCode ? company.address.city : ''),
        state: stateCode ? stateName(stateCode) : editing.address.state,
        stateCode: stateCode || undefined,
      },
    });
    toast.show(editing.id ? 'Branch updated' : 'Branch added', 'success');
    setEditing(null);
  };

  const docCount = (branchId: string) => documents.filter((d) => d.branchId === branchId).length;

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.branches') }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <Card variant="flat" style={{ marginBottom: t.spacing.lg }}>
          <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
            Branches let you keep stock and documents separate by location. Every document records which branch it belongs
            to, and reports can be filtered by it.
          </Text>
        </Card>

        <Card padded={false}>
          {branches.length === 0 ? (
            <EmptyState icon="warehouse" title={tr('settings:branches.none')} compact />
          ) : (
            branches.map((b, i) => (
              <ListRow
                key={b.id}
                title={b.name}
                subtitle={`${b.code}${b.address.city ? ` · ${b.address.city}` : ''}`}
                meta={`${docCount(b.id)} documents`}
                icon={b.isPrimary ? 'office-building-outline' : 'warehouse'}
                divider={i < branches.length - 1}
                right={b.isPrimary ? <Badge label={tr('settings:branches.primary')} tone="info" size="sm" /> : undefined}
                onPress={() => open(b)}
                onLongPress={() => (b.isPrimary ? undefined : setConfirmDelete(b))}
                chevron
              />
            ))
          )}
        </Card>
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: t.spacing.lg,
          paddingBottom: t.spacing.xl,
          borderTopWidth: 1,
          borderTopColor: t.c.line,
          backgroundColor: t.c.paper,
        }}
      >
        <Button title={tr('settings:branches.add')} icon="plus" onPress={() => open()} fullWidth size="lg" />
      </View>

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit branch' : 'Add branch'}
        footer={
          <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
            {editing?.id && !editing.isPrimary ? (
              <Button
                title={tr('settings:branches.delete')}
                variant="danger"
                style={{ flex: 1 }}
                onPress={() => {
                  const b = editing;
                  setEditing(null);
                  setConfirmDelete(b);
                }}
              />
            ) : null}
            <Button title={tr('settings:branches.save')} onPress={save} disabled={!name.trim()} style={{ flex: 2 }} />
          </View>
        }
      >
        <View style={{ padding: t.spacing.lg, gap: t.spacing.lg }}>
          <TextField label={tr('settings:branches.name')} value={name} onChangeText={setName} placeholder={tr('settings:branches.namePlaceholder')} icon="warehouse" required />
          <PickerField
            label={tr('settings:branches.state')}
            value={stateCode ? stateName(stateCode) : undefined}
            onPress={() => setStateOpen(true)}
            icon="map-outline"
          />
          <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
            <TextField label={tr('settings:branches.code')} value={code} onChangeText={(v) => setCode(v.toUpperCase().slice(0, 5))} placeholder="PUN" autoCapitalize="characters" containerStyle={{ flex: 1 }} />
            <CityField label={tr('settings:branches.city')} value={city} onChange={setCity} stateCode={stateCode} containerStyle={{ flex: 1 }} />
          </View>
          <TextField label={tr('settings:branches.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" icon="phone-outline" />
          <SwitchField label={tr('settings:branches.primaryBranch')} description={tr('settings:branches.primaryHint')} value={isPrimary} onValueChange={setIsPrimary} />
        </View>
      </Sheet>

      <SelectSheet
        visible={stateOpen}
        onClose={() => setStateOpen(false)}
        title={tr('settings:branches.state')}
        options={INDIAN_STATES.map((s) => ({ value: s.code, label: s.name, trailing: s.code }))}
        value={stateCode}
        onSelect={(next) => {
          setStateCode(next);
          if (city && !citiesForState(next).includes(city)) setCity('');
        }}
      />

      <ConfirmDialog
        visible={!!confirmDelete}
        title={`Delete ${confirmDelete?.name}?`}
        message={tr('settings:branches.deleteMessage')}
        confirmLabel={tr('settings:branches.delete')}
        destructive
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) removeBranch(confirmDelete.id);
          setConfirmDelete(null);
          toast.show(tr('settings:branches.deleted'), 'success');
        }}
      />
    </View>
  );
}
