import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { Errors, hasErrors, validGstin } from '@/lib/validators';
import { normalizeGstin } from '@/domain/gstin';
import { INDIAN_STATES, stateName } from '@/data/masters';
import { citiesForState } from '@/data/cities';

export default function BranchSettings() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
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
  const [line1, setLine1] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [gstin, setGstin] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [errors, setErrors] = useState<Errors<'gstin' | 'postalCode'>>({});

  const open = (branch?: Branch) => {
    // A new branch starts with a blank address: copying head office's street
    // and PIN would silently put the wrong place on its e-way bills.
    setEditing(
      branch ??
        ({
          id: '',
          companyId: company.id,
          name: '',
          code: '',
          address: { line1: '', city: '', state: '', postalCode: '', country: company.address.country },
          isPrimary: false,
        } as Branch),
    );
    setName(branch?.name ?? '');
    setCode(branch?.code ?? '');
    setLine1(branch?.address.line1 ?? '');
    setPostalCode(branch?.address.postalCode ?? '');
    setCity(branch?.address.city ?? company.address.city);
    setStateCode(branch?.address.stateCode ?? company.address.stateCode ?? '');
    setGstin(branch?.gstin ?? '');
    setPhone(branch?.phone ?? '');
    setIsPrimary(branch?.isPrimary ?? false);
    setErrors({});
  };

  const changeGstin = (v: string) => {
    const next = v.toUpperCase().replace(/\s/g, '').slice(0, 15);
    setGstin(next);
    // The first two digits are the state; fill it in if it's still blank.
    if (!stateCode && /^\d{2}/.test(next) && INDIAN_STATES.some((st) => st.code === next.slice(0, 2))) {
      setStateCode(next.slice(0, 2));
    }
  };

  const save = () => {
    if (!editing || !name.trim()) return;
    const cleanGstin = gstin ? normalizeGstin(gstin) : '';
    const next: Errors<'gstin' | 'postalCode'> = {
      gstin: cleanGstin
        ? validGstin(cleanGstin) ??
          (stateCode && cleanGstin.slice(0, 2) !== stateCode
            ? tr('settings:branches.gstinStateMismatch', { state: stateName(cleanGstin.slice(0, 2)) })
            : undefined)
        : undefined,
      postalCode: postalCode && !/^\d{6}$/.test(postalCode) ? tr('settings:branches.pinInvalid') : undefined,
    };
    setErrors(next);
    if (hasErrors(next)) return;

    saveBranch({
      ...editing,
      id: editing.id || uid('brn'),
      companyId: company.id,
      name: name.trim(),
      code: (code || name.slice(0, 3)).toUpperCase(),
      phone: phone.trim() || undefined,
      gstin: cleanGstin || undefined,
      isPrimary,
      address: {
        ...editing.address,
        line1: line1.trim(),
        postalCode: postalCode.trim(),
        // Head office's city is only a sensible default for a branch in the same state.
        city: city.trim() || (stateCode === company.address.stateCode ? company.address.city : ''),
        state: stateCode ? stateName(stateCode) : editing.address.state,
        stateCode: stateCode || undefined,
      },
    });
    toast.show(editing.id ? tr('settings:branches.updated') : tr('settings:branches.added'), 'success');
    setEditing(null);
  };

  const docCount = (branchId: string) => documents.filter((d) => d.branchId === branchId).length;

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.branches') }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 + insets.bottom }} showsVerticalScrollIndicator={false}>
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
                subtitle={[b.code, b.address.city, b.gstin].filter(Boolean).join(' · ')}
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
          paddingBottom: insets.bottom + t.spacing.md,
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
        title={editing?.id ? tr('settings:branches.editTitle') : tr('settings:branches.addTitle')}
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
          <TextField
            label={tr('settings:branches.gstin')}
            value={gstin}
            onChangeText={changeGstin}
            placeholder="27AABCV1234F1ZO"
            autoCapitalize="characters"
            icon="card-account-details-outline"
            error={errors.gstin}
            hint={tr('settings:branches.gstinHint')}
          />
          <TextField
            label={tr('settings:branches.address')}
            value={line1}
            onChangeText={setLine1}
            placeholder={tr('settings:branches.addressPlaceholder')}
            icon="map-marker-outline"
            multiline
          />
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
          <TextField
            label={tr('settings:branches.pin')}
            value={postalCode}
            onChangeText={(v) => setPostalCode(v.replace(/[^0-9]/g, '').slice(0, 6))}
            placeholder="411001"
            keyboardType="number-pad"
            icon="mailbox-outline"
            error={errors.postalCode}
          />
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
