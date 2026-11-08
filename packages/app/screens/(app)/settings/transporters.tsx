import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Screen } from '@esmart/ui/components/Screen';
import { Card } from '@esmart/ui/components/Card';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Badge } from '@esmart/ui/components/Badge';
import { PrimaryActionBar } from '@esmart/ui/components/ActionBar';
import { Sheet } from '@esmart/ui/components/Sheet';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { PhoneField, TextField, usePhoneInput } from '@esmart/ui/components/Field';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { SheetActions } from '../../../features/company/SheetActions';
import { useAppStore } from '../../../store/appStore';
import { useTransporters } from '../../../store/selectors';
import { Transporter } from '@esmart/core/types';
import { formatGstin, isValidTransporterId } from '@esmart/core/domain/gstin';
import { uid } from '@esmart/core/lib/id';
import { useSaveShortcut } from '../../../components/useSaveShortcut';
import { useServerSave } from '../../../components/useServerSave';

/** The transporter master, used for Part-B of an e-way bill. */
export default function TransportersSettings() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav', 'settings', 'errors']);
  const { run: serverSave, saving } = useServerSave();

  const transporters = useTransporters();
  const saveTransporter = useAppStore((s) => s.saveTransporter);
  const removeTransporter = useAppStore((s) => s.removeTransporter);
  const activeCompanyId = useAppStore((s) => s.activeCompanyId);

  const [editing, setEditing] = useState<Transporter | null>(null);
  const [name, setName] = useState('');
  const [transporterId, setTransporterId] = useState('');
  const phone = usePhoneInput();
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const [nameError, setNameError] = useState<string | undefined>();
  const [idError, setIdError] = useState<string | undefined>();
  const [confirmDelete, setConfirmDelete] = useState<Transporter | null>(null);

  const open = (transporter?: Transporter) => {
    setEditing(transporter ?? null);
    setName(transporter?.name ?? '');
    setTransporterId(transporter?.transporterId ?? '');
    phone.reset(transporter?.phone);
    setPhoneError(undefined);
    setNameError(undefined);
    setIdError(undefined);
    setSheetOpen(true);
  };

  const [sheetOpen, setSheetOpen] = useState(false);

  const save = async () => {
    const id = transporterId.trim().toUpperCase();
    const badName = name.trim() ? undefined : tr('errors:validation.required', { field: tr('settings:transporters.name') });
    const badId = !isValidTransporterId(id)
      ? tr('settings:transporters.idInvalid')
      : transporters.some((x) => x.transporterId === id && x.id !== editing?.id)
        ? tr('settings:transporters.idTaken')
        : undefined;
    const badPhone = phone.error();
    setNameError(badName);
    setIdError(badId);
    setPhoneError(badPhone);
    if (badName || badId || badPhone) return;
    const transporter: Transporter = {
      id: editing?.id ?? uid('trn'),
      companyId: editing?.companyId ?? activeCompanyId,
      name: name.trim(),
      transporterId: transporterId.trim().toUpperCase(),
      phone: phone.value || undefined,
      status: 'active',
    };
    // The sheet stays open until the server has it, so a refusal can be fixed here.
    const res = await serverSave(
      () => saveTransporter(transporter),
      editing ? tr('settings:transporters.updated') : tr('settings:transporters.added'),
      { icon: 'truck-outline' },
    );
    if (res) setSheetOpen(false);
  };

  // Ctrl+S (⌘+S) does what Save does, while the form is open.
  useSaveShortcut(save, sheetOpen);

  return (
    <>
      <Stack.Screen options={{ title: tr('nav:title.transporters') }} />
      <Screen bottomInset={100}>
        {transporters.length === 0 ? (
          <Card padded={false}>
            <EmptyState
              illustration="no-contacts"
              icon="truck-outline"
              title={tr('settings:transporters.none')}
              message={tr('settings:transporters.noneBody')}
              actionLabel={tr('settings:transporters.add')}
              onAction={() => open()}
              compact
            />
          </Card>
        ) : (
          <Card padded={false}>
            {transporters.map((transporter, i) => (
              <ListRow
                key={transporter.id}
                title={transporter.name}
                subtitle={formatGstin(transporter.transporterId)}
                icon="truck-outline"
                right={transporter.status === 'inactive' ? <Badge label={tr('settings:transporters.inactive')} tone="neutral" size="sm" /> : undefined}
                divider={i < transporters.length - 1}
                onPress={() => open(transporter)}
                chevron
              />
            ))}
          </Card>
        )}
      </Screen>

      <PrimaryActionBar title={tr('settings:transporters.add')} icon="plus" onPress={() => open()} />

      <Sheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editing ? tr('settings:transporters.editTitle') : tr('settings:transporters.add')}
        footer={
          <SheetActions
            saveLabel={tr('settings:transporters.save')}
            onSave={save}
            saving={saving}
            deleteLabel={tr('settings:transporters.delete')}
            onDelete={
              editing
                ? () => {
                    setSheetOpen(false);
                    setConfirmDelete(editing);
                  }
                : undefined
            }
          />
        }
      >
        <View style={{ padding: t.spacing.lg, gap: t.spacing.md }}>
          <TextField label={tr('settings:transporters.name')} required value={name} onChangeText={setName} placeholder={tr('settings:transporters.namePlaceholder')} error={nameError} />
          <TextField
            label={tr('settings:transporters.id')}
            required
            value={transporterId}
            onChangeText={(v) => setTransporterId(((v) => v.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 15))(v))}
            placeholder="27AABCT5512M1Z6"
            autoCapitalize="characters"
            maxLength={15}
            error={idError}
            hint={tr('settings:transporters.idHint')}
          />
          <PhoneField label={tr('settings:transporters.phone')} {...phone.field} placeholder="22 6789 1000" error={phoneError} />
        </View>
      </Sheet>

      <ConfirmDialog
        visible={!!confirmDelete}
        title={tr('settings:transporters.deleteTitle', { name: confirmDelete?.name ?? '' })}
        message={tr('settings:transporters.deleteMessage')}
        confirmLabel={tr('settings:transporters.delete')}
        destructive
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          const x = confirmDelete;
          setConfirmDelete(null);
          if (x) void serverSave(() => removeTransporter(x.id), tr('settings:transporters.removed'), { icon: 'truck-remove-outline' });
        }}
      />
    </>
  );
}
