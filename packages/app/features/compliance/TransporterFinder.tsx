import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Button } from '@esmart/ui/components/Button';
import { Sheet } from '@esmart/ui/components/Sheet';
import { PhoneField, TextField, usePhoneInput } from '@esmart/ui/components/Field';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { isValidTransporterId } from '@esmart/core/domain/gstin';
import { shownError } from '@esmart/core/lib/validators';
import { uid } from '@esmart/core/lib/id';
import type { Transporter } from '@esmart/core/types';
import { useAppStore } from '../../store/appStore';
import { useTransporters } from '../../store/selectors';
import { useServerSave } from '../../components/useServerSave';
import { SheetActions } from '../company/SheetActions';

/**
 * The saved transporters, searched by name or ID, for Part-B of an e-way bill: the same list as
 * Settings → Transporters. Picking one hands it back (its ID and name fill the form, still editable
 * there). A carrier not in it yet is added from here, into that same list, and is picked at once.
 */
export function TransporterFinder({ visible, onClose, value, onPick }: { visible: boolean; onClose: () => void; value?: string; onPick: (transporter: Transporter) => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['compliance', 'settings', 'errors']);
  const { run: serverSave, saving } = useServerSave();
  const transporters = useTransporters();
  const saveTransporter = useAppStore((s) => s.saveTransporter);
  const activeCompanyId = useAppStore((s) => s.activeCompanyId);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [transporterId, setTransporterId] = useState('');
  const phone = usePhoneInput();
  const [nameError, setNameError] = useState<string | undefined>();

  // Checked as typed, as in Settings: the ID's shape and that no other transporter has it, and the phone.
  const typedId = transporterId.trim().toUpperCase();
  const liveId = !typedId
    ? undefined
    : !isValidTransporterId(typedId)
      ? tr('settings:transporters.idInvalid')
      : transporters.some((x) => x.transporterId === typedId)
        ? tr('settings:transporters.idTaken')
        : undefined;
  const livePhone = phone.error();

  const startAdding = () => {
    setName('');
    setTransporterId('');
    phone.reset(undefined);
    setNameError(undefined);
    setAdding(true);
  };

  const close = () => {
    setAdding(false);
    onClose();
  };

  const save = async () => {
    const badName = name.trim() ? undefined : tr('errors:validation.required', { field: tr('settings:transporters.name') });
    setNameError(badName);
    if (badName || !typedId || liveId || livePhone) return;
    const transporter: Transporter = {
      id: uid('trn'),
      companyId: activeCompanyId,
      name: name.trim(),
      transporterId: typedId,
      phone: phone.value || undefined,
      status: 'active',
    };
    // Saved to the transporter master, so Settings → Transporters lists it too.
    const res = await serverSave(() => saveTransporter(transporter), tr('settings:transporters.added'), { icon: 'truck-outline' });
    if (!res) return;
    onPick(transporter);
    close();
  };

  return (
    <>
      <SelectSheet
        visible={visible && !adding}
        onClose={close}
        title={tr('compliance:ewb.findTransporter')}
        searchPlaceholder={tr('compliance:ewb.findTransporterSearch')}
        emptyMessage={transporters.length ? undefined : tr('compliance:ewb.noSavedTransporters')}
        // Only those still in use are offered; an inactive one stays in Settings.
        options={transporters.filter((x) => x.status !== 'inactive').map((x) => ({ value: x.id, label: x.name, description: x.transporterId }))}
        value={value}
        onSelect={(id) => {
          const picked = transporters.find((x) => x.id === id);
          if (picked) onPick(picked);
          close();
        }}
        footer={<Button title={tr('settings:transporters.add')} icon="plus" variant="secondary" onPress={startAdding} fullWidth />}
      />
      <Sheet
        visible={visible && adding}
        onClose={close}
        desktopAs="drawer"
        title={tr('settings:transporters.add')}
        subtitle={tr('settings:transporters.dialogBody')}
        footer={<SheetActions saveLabel={tr('settings:transporters.save')} onSave={save} saving={saving} saveDisabled={!!liveId || !!livePhone} />}
      >
        <View style={{ padding: t.spacing.lg, gap: t.spacing.lg }}>
          <TextField
            label={tr('settings:transporters.name')}
            required
            value={name}
            onChangeText={(v) => {
              setName(v);
              if (nameError) setNameError(undefined);
            }}
            placeholder={tr('settings:transporters.namePlaceholder')}
            error={nameError}
          />
          <TextField
            label={tr('settings:transporters.id')}
            required
            value={transporterId}
            onChangeText={(v) => setTransporterId(v.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 15))}
            placeholder="27AABCT5512M1Z6"
            autoCapitalize="characters"
            maxLength={15}
            error={liveId}
            hint={tr('settings:transporters.idHint')}
          />
          <PhoneField label={tr('settings:transporters.phone')} {...phone.field} placeholder="22 6789 1000" error={shownError(phone.field.value, livePhone, undefined)} />
          <Button title={tr('compliance:ewb.backToTransporters')} variant="ghost" icon="arrow-left" onPress={() => setAdding(false)} style={{ alignSelf: 'flex-start' }} />
        </View>
      </Sheet>
    </>
  );
}
