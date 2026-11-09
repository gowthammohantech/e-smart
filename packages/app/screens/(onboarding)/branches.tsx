import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { WizardShell } from '@esmart/ui/components/WizardShell';
import { PickerField, TextField } from '@esmart/ui/components/Field';
import { CityField } from '@esmart/ui/components/pickers/CityField';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { Card } from '@esmart/ui/components/Card';
import { Text } from '@esmart/ui/components/Text';
import { Button } from '@esmart/ui/components/Button';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { nextStepRoute, onboardingSteps, stepIndex, useOnboardingStore } from '../../store/onboardingStore';
import { INDIAN_STATES, stateName } from '@esmart/core/data/masters';
import { citiesForState } from '@esmart/core/data/cities';
import { normalizeGstin } from '@esmart/core/domain/gstin';
import { validGstin, validPostalCode } from '@esmart/core/lib/validators';
import { FieldRow } from '@esmart/ui/components/Layout';
import { useFieldWidth, useIsDesktop } from '@esmart/ui/theme/breakpoints';

export default function BranchesStep() {
  const t = useTheme();
  const { t: tr } = useTranslation(['onboarding', 'settings']);
  const router = useRouter();
  const { draft, set } = useOnboardingStore();
  const desktop = useIsDesktop();
  const fw = useFieldWidth();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [city, setCity] = useState('');
  const [line1, setLine1] = useState('');
  const [stateCode, setStateCode] = useState(draft.address.stateCode ?? '');
  const [postalCode, setPostalCode] = useState('');
  const [gstin, setGstin] = useState('');
  const [stateOpen, setStateOpen] = useState(false);
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const gstinError = validGstin(gstin);
  const pinError = validPostalCode(postalCode, draft.address.country, stateCode);
  const canAdd = !!name.trim() && !(gstin && gstinError) && !pinError;
  // Typed but not added yet: finishing now would lose it.
  const unsaved = [name, code, city, line1, postalCode, gstin].some((v) => v.trim());

  const finish = () => router.push(nextStepRoute('branches', draft.plan));

  const add = () => {
    if (!canAdd) return;
    set({
      branches: [
        ...draft.branches,
        {
          name: name.trim(),
          code: (code || name.slice(0, 3)).toUpperCase(),
          city: city.trim(),
          line1: line1.trim(),
          stateCode: stateCode || undefined,
          postalCode,
          gstin: gstin ? normalizeGstin(gstin) : undefined,
        },
      ],
    });
    setName('');
    setCode('');
    setCity('');
    setLine1('');
    setPostalCode('');
    setGstin('');
  };

  const codeField = (
    <TextField
      label={tr('onboarding:branches.code')}
      value={code}
      onChangeText={(v) => setCode(v.toUpperCase().slice(0, 5))}
      placeholder="PUN"
      autoCapitalize="characters"
    />
  );

  return (
    <WizardShell
      title={tr('onboarding:branches.title')}
      subtitle={tr('onboarding:branches.subtitle')}
      steps={onboardingSteps(draft.plan)}
      currentStep={stepIndex('branches', draft.plan)}
      primaryLabel={tr('onboarding:branches.finish')}
      onPrimary={() => (unsaved ? setUnsavedOpen(true) : finish())}
      onSkip={finish}
    >
      <Card variant="flat" style={{ gap: t.spacing.sm, flexDirection: 'row', alignItems: 'center' }}>
        <Icon name="office-building-outline" size={20} color={t.c.primary} />
        <View style={{ flex: 1 }}>
          <Text variant="body" weight="600">{tr('onboarding:branches.headOffice')}</Text>
          <Text variant="caption" tone="muted">
            {tr('onboarding:branches.createdAutomatically', { place: draft.address.city || tr('onboarding:branches.primary') })}
          </Text>
        </View>
      </Card>

      {draft.branches.map((b, i) => (
        <Card key={`${b.code}-${i}`} variant="flat" style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
          <Icon name="warehouse" size={20} color={t.c.muted} />
          <View style={{ flex: 1 }}>
            <Text variant="body" weight="600">
              {b.name}
            </Text>
            <Text variant="caption" tone="muted">
              {[b.code, b.line1, b.city, b.gstin].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Pressable
            onPress={() => set({ branches: draft.branches.filter((_, j) => j !== i) })}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={tr('onboarding:branches.removeNamed', { name: b.name })}
          >
            <Icon name="close-circle" size={19} color={t.c.muted} />
          </Pressable>
        </Card>
      ))}

      {/* A desktop pairs the short fields and keeps Add branch at its own width, at the right. */}
      <View style={{ gap: t.spacing.md }}>
        <FieldRow>
          <TextField label={tr('onboarding:branches.name')} value={name} onChangeText={setName} placeholder={tr('onboarding:branches.namePlaceholder')} icon="warehouse" />
          {desktop ? codeField : null}
        </FieldRow>
        <TextField
          label={tr('settings:branches.address')}
          value={line1}
          onChangeText={setLine1}
          placeholder={tr('settings:branches.addressPlaceholder')}
          icon="map-marker-outline"
        />
        {/* State before city: the city list depends on the state. */}
        <FieldRow>
          <PickerField
            label={tr('settings:branches.state')}
            value={stateCode ? stateName(stateCode) : undefined}
            onPress={() => setStateOpen(true)}
            icon="map-outline"
          />
          <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
            <CityField
              label={tr('onboarding:branches.city')}
              value={city}
              onChange={setCity}
              stateCode={stateCode}
              placeholder={tr('onboarding:branches.cityPlaceholder')}
              containerStyle={{ flex: 1 }}
            />
            <TextField
              label={tr('settings:branches.pin')}
              value={postalCode}
              onChangeText={(v) => setPostalCode(v.replace(/[^0-9]/g, '').slice(0, 6))}
              placeholder="411001"
              keyboardType="number-pad"
              error={pinError}
              containerStyle={{ flex: 1 }}
            />
          </View>
        </FieldRow>
        {desktop ? null : codeField}
        <TextField
          label={tr('settings:branches.gstin')}
          value={gstin}
          onChangeText={(v) => setGstin(v.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 15))}
          placeholder="27AABCV1234F1ZO"
          autoCapitalize="characters"
          icon="card-account-details-outline"
          error={gstin.length === 15 ? gstinError : undefined}
          hint={tr('settings:branches.gstinHint')}
          containerStyle={fw('md')}
        />
        <View style={desktop ? { flexDirection: 'row', justifyContent: 'flex-end' } : undefined}>
          <Button title={tr('onboarding:branches.add')} variant="secondary" icon="plus" onPress={add} disabled={!canAdd} />
        </View>
      </View>

      <ConfirmDialog
        visible={unsavedOpen}
        title={tr('onboarding:branches.unsavedTitle')}
        message={tr(canAdd ? 'onboarding:branches.unsavedAddMessage' : 'onboarding:branches.unsavedDiscardMessage', { name: name.trim() })}
        confirmLabel={tr(canAdd ? 'onboarding:branches.unsavedAdd' : 'onboarding:branches.unsavedDiscard')}
        cancelLabel={tr('onboarding:branches.unsavedKeepEditing')}
        destructive={!canAdd}
        onCancel={() => setUnsavedOpen(false)}
        onConfirm={() => {
          setUnsavedOpen(false);
          if (canAdd) add();
          finish();
        }}
      />

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
    </WizardShell>
  );
}
