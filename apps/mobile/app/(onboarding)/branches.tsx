import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { WizardShell } from '@/components/WizardShell';
import { PickerField, TextField } from '@/components/Field';
import { CityField } from '@/components/pickers/CityField';
import { SelectSheet } from '@/components/pickers/SelectSheet';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { nextStepRoute, onboardingSteps, stepIndex, useOnboardingStore } from '@/store/onboardingStore';
import { INDIAN_STATES, stateName } from '@esmart/core/data/masters';
import { citiesForState } from '@esmart/core/data/cities';
import { normalizeGstin } from '@esmart/core/domain/gstin';
import { validGstin } from '@esmart/core/lib/validators';

export default function BranchesStep() {
  const t = useTheme();
  const { t: tr } = useTranslation(['onboarding', 'settings']);
  const router = useRouter();
  const { draft, set } = useOnboardingStore();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [city, setCity] = useState('');
  const [line1, setLine1] = useState('');
  const [stateCode, setStateCode] = useState(draft.address.stateCode ?? '');
  const [postalCode, setPostalCode] = useState('');
  const [gstin, setGstin] = useState('');
  const [stateOpen, setStateOpen] = useState(false);
  const gstinError = validGstin(gstin);

  const add = () => {
    if (!name.trim() || gstinError) return;
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

  return (
    <WizardShell
      title={tr('onboarding:branches.title')}
      subtitle={tr('onboarding:branches.subtitle')}
      steps={onboardingSteps(draft.plan)}
      currentStep={stepIndex('branches', draft.plan)}
      primaryLabel={tr('onboarding:branches.finish')}
      onPrimary={() => router.push(nextStepRoute('branches', draft.plan))}
      onSkip={() => router.push(nextStepRoute('branches', draft.plan))}
    >
      <Card variant="flat" style={{ gap: t.spacing.sm, flexDirection: 'row', alignItems: 'center' }}>
        <MaterialCommunityIcons name="office-building-outline" size={20} color={t.c.primary} />
        <View style={{ flex: 1 }}>
          <Text variant="body" weight="600">{tr('onboarding:branches.headOffice')}</Text>
          <Text variant="caption" tone="muted">
            {draft.address.city || tr('onboarding:branches.primary')} · created automatically
          </Text>
        </View>
      </Card>

      {draft.branches.map((b, i) => (
        <Card key={`${b.code}-${i}`} variant="flat" style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
          <MaterialCommunityIcons name="warehouse" size={20} color={t.c.muted} />
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
            accessibilityLabel={`Remove ${b.name}`}
          >
            <MaterialCommunityIcons name="close-circle" size={19} color={t.c.muted} />
          </Pressable>
        </Card>
      ))}

      <View style={{ gap: t.spacing.md }}>
        <TextField label={tr('onboarding:branches.name')} value={name} onChangeText={setName} placeholder={tr('onboarding:branches.namePlaceholder')} icon="warehouse" />
        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <TextField
            label={tr('onboarding:branches.code')}
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase().slice(0, 5))}
            placeholder="PUN"
            autoCapitalize="characters"
            containerStyle={{ flex: 1 }}
          />
          <CityField
            label={tr('onboarding:branches.city')}
            value={city}
            onChange={setCity}
            stateCode={stateCode}
            placeholder={tr('onboarding:branches.cityPlaceholder')}
            containerStyle={{ flex: 1 }}
          />
        </View>
        <TextField
          label={tr('settings:branches.address')}
          value={line1}
          onChangeText={setLine1}
          placeholder={tr('settings:branches.addressPlaceholder')}
          icon="map-marker-outline"
        />
        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <PickerField
            label={tr('settings:branches.state')}
            value={stateCode ? stateName(stateCode) : undefined}
            onPress={() => setStateOpen(true)}
            containerStyle={{ flex: 1 }}
          />
          <TextField
            label={tr('settings:branches.pin')}
            value={postalCode}
            onChangeText={(v) => setPostalCode(v.replace(/[^0-9]/g, '').slice(0, 6))}
            placeholder="411001"
            keyboardType="number-pad"
            containerStyle={{ flex: 1 }}
          />
        </View>
        <TextField
          label={tr('settings:branches.gstin')}
          value={gstin}
          onChangeText={(v) => setGstin(v.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 15))}
          placeholder="27AABCV1234F1ZO"
          autoCapitalize="characters"
          icon="card-account-details-outline"
          error={gstin.length === 15 ? gstinError : undefined}
          hint={tr('settings:branches.gstinHint')}
        />
        <Button title={tr('onboarding:branches.add')} variant="secondary" icon="plus" onPress={add} disabled={!name.trim() || (!!gstin && !!gstinError)} />
      </View>

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
