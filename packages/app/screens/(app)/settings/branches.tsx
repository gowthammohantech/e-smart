import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { PrimaryActionBar } from '@esmart/ui/components/ActionBar';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Cell, DataTable } from '@esmart/ui/components/DataTable';
import { Sheet } from '@esmart/ui/components/Sheet';
import { PhoneField, PickerField, TextField, SwitchField, usePhoneInput } from '@esmart/ui/components/Field';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { CityField } from '@esmart/ui/components/pickers/CityField';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { Branch } from '@esmart/core/types';
import { useAppStore } from '../../../store/appStore';
import { useActiveCompany, useBranches, usePlan } from '../../../store/selectors';
import { useCompanyUsage } from '../../../remote/queries';
import { Skeleton, SkeletonGroup } from '@esmart/ui/components/Skeleton';
import { hasModule } from '@esmart/core/domain/plan';
import { uid } from '@esmart/core/lib/id';
import { Errors, hasErrors, validGstin, validPostalCode } from '@esmart/core/lib/validators';
import { normalizeGstin } from '@esmart/core/domain/gstin';
import { INDIAN_STATES, stateName } from '@esmart/core/data/masters';
import { citiesForState } from '@esmart/core/data/cities';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { FieldGrid } from '@esmart/ui/components/Layout';
import { useGstinLookup, type GstinDetails } from '../../../features/gstin/useGstinLookup';
import { useSaveShortcut } from '../../../components/useSaveShortcut';
import { SheetActions } from '../../../features/company/SheetActions';
import { useServerSave } from '../../../components/useServerSave';

export default function BranchSettings() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const desktop = useIsDesktop();
  const { t: tr } = useTranslation(['nav', 'settings', 'errors', 'common']);
  const { run: serverSave, saving } = useServerSave();

  const company = useActiveCompany();
  const branches = useBranches();
  const usageQuery = useCompanyUsage();
  const usage = usageQuery.data;
  // Until the server answers, a count would read 0 ("not used"): a placeholder instead.
  const usagePending = !usage && !usageQuery.isError;
  const saveBranch = useAppStore((s) => s.saveBranch);
  const removeBranch = useAppStore((s) => s.removeBranch);
  const router = useRouter();
  // Below Pro a business has its one branch: it can be renamed, and the rest of
  // it follows Business profile. Adding more is what upgrading opens.
  const locked = !hasModule(usePlan(), 'branches');

  const [editing, setEditing] = useState<Branch | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Branch | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [city, setCity] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [stateOpen, setStateOpen] = useState(false);
  const phone = usePhoneInput();
  const [line1, setLine1] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [gstin, setGstin] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [errors, setErrors] = useState<Errors<'name' | 'code' | 'line1' | 'gstin' | 'postalCode' | 'phone'>>({});

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
    phone.reset(branch?.phone);
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

  // A GSTIN brings the branch's registered address from the GST portal. Its name
  // stays: the portal's is the company's, and a branch is named for its place.
  const fillFromPortal = (d: GstinDetails) => {
    const a = d.address;
    if (!a) return;
    const street = [a.line1, a.line2].filter(Boolean).join(', ');
    if (street) setLine1(street);
    const code = a.stateCode ?? gstin.slice(0, 2);
    if (INDIAN_STATES.some((st) => st.code === code)) setStateCode(code);
    // A city left from another state goes, as when the state is picked by hand.
    if (a.city) setCity(a.city);
    else if (city && !citiesForState(code).includes(city)) setCity('');
    if (a.postalCode) setPostalCode(a.postalCode);
  };
  const gstinLookup = useGstinLookup({ gstin, opened: editing?.gstin, enabled: !!editing && !locked, fill: fillFromPortal });

  const save = async () => {
    if (!editing) return;
    // An empty name says so on the field, rather than a Save that silently does nothing.
    if (!name.trim()) {
      setErrors({ name: tr('errors:validation.required', { field: tr('settings:branches.name') }) });
      return;
    }
    if (locked) {
      // Only the name is the person's to change here; the server keeps the rest as it is too.
      const taken = branches.some((b) => b.id !== editing.id && b.name.trim().toLowerCase() === name.trim().toLowerCase());
      setErrors(taken ? { name: tr('settings:branches.nameTaken', { name: name.trim() }) } : {});
      if (taken) return;
      const res = await serverSave(() => saveBranch({ ...editing, name: name.trim() }), tr('settings:branches.updated'), {
        icon: 'office-building-marker-outline',
      });
      if (res) setEditing(null);
      return;
    }
    const cleanGstin = gstin ? normalizeGstin(gstin) : '';
    const nextCode = (code || name.slice(0, 3)).toUpperCase();
    // The same branch twice: a repeated name, code, or street and PIN is the same place (the server refuses them too).
    const others = branches.filter((b) => b.id !== editing.id);
    const street = (s: string) => s.trim().toLowerCase().replace(/[\s,.]+/g, ' ');
    const sameAddress = line1.trim()
      ? others.find((b) => street(b.address.line1) === street(line1) && b.address.postalCode.trim() === postalCode.trim())
      : undefined;
    const next: Errors<'name' | 'code' | 'line1' | 'gstin' | 'postalCode' | 'phone'> = {
      name: others.some((b) => b.name.trim().toLowerCase() === name.trim().toLowerCase())
        ? tr('settings:branches.nameTaken', { name: name.trim() })
        : undefined,
      code: others.some((b) => b.code.toUpperCase() === nextCode) ? tr('settings:branches.codeTaken', { code: nextCode }) : undefined,
      line1: sameAddress ? tr('settings:branches.addressTaken', { name: sameAddress.name }) : undefined,
      gstin: cleanGstin
        ? validGstin(cleanGstin) ??
          (stateCode && cleanGstin.slice(0, 2) !== stateCode
            ? tr('settings:branches.gstinStateMismatch', { state: stateName(cleanGstin.slice(0, 2)) })
            : undefined)
        : undefined,
      postalCode: validPostalCode(postalCode, company.address.country, stateCode),
      phone: phone.error(),
    };
    setErrors(next);
    if (hasErrors(next)) return;

    const branch = {
      ...editing,
      id: editing.id || uid('brn'),
      companyId: company.id,
      name: name.trim(),
      code: nextCode,
      phone: phone.value || undefined,
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
    };
    // The sheet stays open until the server has it, so a refusal can be fixed here.
    const res = await serverSave(
      () => saveBranch(branch),
      editing.id ? tr('settings:branches.updated') : tr('settings:branches.added'),
      { icon: 'office-building-marker-outline' },
    );
    if (res) setEditing(null);
  };

  const docCount = (branchId: string) => usage?.documentsByBranch[branchId] ?? 0;

  // Ctrl+S (⌘+S) does what Save does, while the form is open.
  useSaveShortcut(save, !!editing);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.branches') }} />

      {/* The add button sits in the page header on a desktop, so no room is kept for a bottom bar. */}
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: desktop ? t.spacing.xxl : 120 + insets.bottom }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Card variant="flat" style={{ marginBottom: t.spacing.lg }}>
          <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
            {tr('settings:branches.intro')}
          </Text>
          {locked ? (
            <Text variant="caption" weight="600" style={{ lineHeight: 18, marginTop: t.spacing.sm }}>
              {tr('settings:branches.oneOnPlan')}
            </Text>
          ) : null}
        </Card>

        {desktop && branches.length ? (
          // A desktop lists branches as a table: code, GSTIN, place and how many documents each has.
          <DataTable
            scroll={false}
            rows={branches}
            rowKey={(b) => b.id}
            rowLabel={(b) => b.name}
            onRowPress={open}
            columns={[
              { key: 'name', header: tr('settings:branches.name'), flex: 2, sortValue: (b) => b.name, render: (b) => <Cell weight="600">{b.name}</Cell> },
              { key: 'code', header: tr('settings:branches.code'), width: 100, render: (b) => <Cell tone="muted">{b.code || '—'}</Cell> },
              { key: 'gstin', header: tr('settings:branches.gstin'), width: 190, render: (b) => <Cell mono>{b.gstin || '—'}</Cell> },
              { key: 'city', header: tr('settings:branches.city'), flex: 1, secondary: true, sortValue: (b) => b.address.city, render: (b) => <Cell tone="muted">{[b.address.city, b.address.state].filter(Boolean).join(', ') || '—'}</Cell> },
              { key: 'status', header: tr('common:table.status'), width: 110, render: (b) => (b.isPrimary ? <Badge label={tr('settings:branches.primary')} tone="info" size="sm" /> : null) },
              {
                key: 'documents',
                header: tr('settings:branches.documents'),
                width: 130,
                align: 'right',
                sortValue: (b) => docCount(b.id),
                render: (b) =>
                  usagePending ? (
                    <SkeletonGroup>
                      <Skeleton height={12} width={32} radius={4} />
                    </SkeletonGroup>
                  ) : (
                    <Cell mono>{String(docCount(b.id))}</Cell>
                  ),
              },
            ]}
          />
        ) : (
          <Card padded={false}>
            {branches.length === 0 ? (
              <EmptyState icon="warehouse" title={tr('settings:branches.none')} compact />
            ) : (
              branches.map((b, i) => (
                <ListRow
                  key={b.id}
                  title={b.name}
                  // The GSTIN first, where it isn't cut off; the street is on the branch itself.
                  subtitle={[b.gstin, b.code, b.address.city].filter(Boolean).join(' · ')}
                  meta={usagePending ? undefined : tr('settings:branches.docCount', { count: docCount(b.id) })}
                  icon={b.isPrimary ? 'office-building-outline' : 'warehouse'}
                  divider={i < branches.length - 1}
                  right={
                    usagePending ? (
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        {b.isPrimary ? <Badge label={tr('settings:branches.primary')} tone="info" size="sm" /> : null}
                        {/* The document count, not known yet. */}
                        <SkeletonGroup>
                          <Skeleton height={10} width={64} radius={4} />
                        </SkeletonGroup>
                      </View>
                    ) : b.isPrimary ? (
                      <Badge label={tr('settings:branches.primary')} tone="info" size="sm" />
                    ) : undefined
                  }
                  onPress={() => open(b)}
                  chevron
                />
              ))
            )}
          </Card>
        )}
      </ScrollView>

      <PrimaryActionBar
        title={tr('settings:branches.add')}
        icon={locked ? 'lock-outline' : 'plus'}
        tooltip={locked ? tr('settings:branches.upgradeToAdd') : undefined}
        onPress={() => (locked ? router.push('/(app)/settings/plan') : open())}
      />

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        // Nine fields: a drawer beside the list on a desktop.
        desktopAs="drawer"
        title={editing?.id ? tr('settings:branches.editTitle') : tr('settings:branches.addTitle')}
        footer={
          <SheetActions
            saveLabel={tr('settings:branches.save')}
            onSave={save}
            saving={saving}
            deleteLabel={tr('settings:branches.delete')}
            onDelete={
              editing?.id && !editing.isPrimary && !locked
                ? () => {
                    const b = editing;
                    setEditing(null);
                    setConfirmDelete(b);
                  }
                : undefined
            }
          />
        }
      >
        <View style={{ padding: t.spacing.lg, gap: t.spacing.lg }}>
          <TextField label={tr('settings:branches.name')} value={name} onChangeText={setName} placeholder={tr('settings:branches.namePlaceholder')} icon="warehouse" required error={errors.name} />
          {locked ? (
            <Card variant="flat">
              <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>{tr('settings:branches.onlyName')}</Text>
            </Card>
          ) : null}
          <TextField
            label={tr('settings:branches.gstin')}
            value={gstin}
            onChangeText={changeGstin}
            editable={!locked}
            placeholder="27AABCV1234F1ZO"
            autoCapitalize="characters"
            icon="card-account-details-outline"
            error={errors.gstin}
            hint={locked ? undefined : (gstinLookup.hint ?? tr('settings:branches.gstinHint'))}
            suffix={gstinLookup.suffix}
          />
          <TextField
            label={tr('settings:branches.address')}
            value={line1}
            onChangeText={setLine1}
            placeholder={tr('settings:branches.addressPlaceholder')}
            icon="map-marker-outline"
            multiline
            error={errors.line1}
            editable={!locked}
          />
          <PickerField
            label={tr('settings:branches.state')}
            value={stateCode ? stateName(stateCode) : undefined}
            onPress={() => setStateOpen(true)}
            icon="map-outline"
            disabled={locked}
          />
          {/* The grid's gap on a desktop, so code and city line up with PIN and phone below. */}
          <View style={{ flexDirection: 'row', gap: desktop ? t.spacing.lg : t.spacing.md }}>
            <TextField label={tr('settings:branches.code')} value={code} onChangeText={(v) => setCode(v.toUpperCase().slice(0, 5))} placeholder="PUN" autoCapitalize="characters" error={errors.code} containerStyle={{ flex: 1 }} editable={!locked} />
            <CityField label={tr('settings:branches.city')} value={city} onChange={setCity} stateCode={stateCode} containerStyle={{ flex: 1 }} disabled={locked} />
          </View>
          {/* PIN and phone pair up on a desktop. */}
          <FieldGrid
            items={[
              <TextField
                key="pin"
                label={tr('settings:branches.pin')}
                value={postalCode}
                onChangeText={(v) => setPostalCode(v.replace(/[^0-9]/g, '').slice(0, 6))}
                placeholder="411001"
                keyboardType="number-pad"
                icon="mailbox-outline"
                error={errors.postalCode}
                editable={!locked}
              />,
              <PhoneField key="phone" label={tr('settings:branches.phone')} {...phone.field} error={errors.phone} disabled={locked} />,
            ]}
          />
          <SwitchField label={tr('settings:branches.primaryBranch')} description={tr('settings:branches.primaryHint')} value={isPrimary} onValueChange={setIsPrimary} disabled={locked} />
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
        title={tr('settings:branches.deleteTitle', { name: confirmDelete?.name })}
        message={tr('settings:branches.deleteMessage')}
        confirmLabel={tr('settings:branches.delete')}
        destructive
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          const b = confirmDelete;
          setConfirmDelete(null);
          if (b) void serverSave(() => removeBranch(b.id), tr('settings:branches.deleted'), { icon: 'office-building-remove-outline' });
        }}
      />
    </View>
  );
}
