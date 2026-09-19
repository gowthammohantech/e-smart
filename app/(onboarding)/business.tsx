import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { WizardShell } from '@/components/WizardShell';
import { TextField, PickerField } from '@/components/Field';
import { SelectSheet } from '@/components/pickers/SelectSheet';
import { Text } from '@/components/Text';
import { nextStepRoute, onboardingSteps, stepIndex, useOnboardingStore } from '@/store/onboardingStore';
import { BUSINESS_TYPES, INDIAN_STATES } from '@/data/masters';
import { PLANS, moduleSetFor, planInfo } from '@/domain/plan';
import type { PlanTier } from '@/types';
import { Errors, hasErrors, required, validEmail, validPhone } from '@/lib/validators';

export default function BusinessStep() {
  const t = useTheme();
  const { t: tr } = useTranslation(['onboarding', 'errors', 'domain']);
  const router = useRouter();
  const { draft, set, setAddress } = useOnboardingStore();

  const [typeOpen, setTypeOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [stateOpen, setStateOpen] = useState(false);
  const [errors, setErrors] = useState<Errors<'name' | 'city' | 'state' | 'email' | 'phone'>>({});

  const pickLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (!result.canceled && result.assets[0]) set({ logoUri: result.assets[0].uri });
  };

  const next = () => {
    const nextErrors: Errors<'name' | 'city' | 'state' | 'email' | 'phone'> = {
      name: required(draft.name, tr('errors:field.businessName')),
      city: required(draft.address.city, 'City'),
      state: required(draft.address.state, 'State'),
      email: validEmail(draft.email),
      phone: validPhone(draft.phone),
    };
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) return;
    router.push(nextStepRoute('business', draft.plan));
  };

  return (
    <WizardShell
      title={tr('onboarding:business.title')}
      subtitle={tr('onboarding:business.subtitle')}
      steps={onboardingSteps(draft.plan)}
      currentStep={stepIndex('business', draft.plan)}
      onPrimary={next}
    >
      <View style={{ alignItems: 'center', gap: t.spacing.sm }}>
        <Pressable
          onPress={pickLogo}
          accessibilityRole="button"
          accessibilityLabel={tr('onboarding:business.addLogo')}
          style={{
            width: 84,
            height: 84,
            borderRadius: t.radius.lg,
            backgroundColor: t.c.card2,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: t.c.line,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {draft.logoUri ? (
            <View style={{ width: '100%', height: '100%', backgroundColor: t.c.chip, alignItems: 'center', justifyContent: 'center' }}>
              <MaterialCommunityIcons name="check" size={26} color={t.c.primary} />
            </View>
          ) : (
            <MaterialCommunityIcons name="image-plus" size={26} color={t.c.muted} />
          )}
        </Pressable>
        <Text variant="caption" tone="muted">
          {draft.logoUri ? tr('onboarding:business.logoSelected') : tr('onboarding:business.logoOptional')}
        </Text>
      </View>

      <TextField
        label={tr('onboarding:business.name')}
        value={draft.name}
        onChangeText={(v) => set({ name: v })}
        placeholder="e.g. Vertex Traders"
        error={errors.name}
        required
      />
      <TextField
        label={tr('onboarding:business.legalName')}
        value={draft.legalName}
        onChangeText={(v) => set({ legalName: v })}
        placeholder={tr('onboarding:business.legalNamePlaceholder')}
      />
      <PickerField label={tr('onboarding:business.type')} value={tr(`onboarding:businessType.${draft.businessType}` as 'onboarding:businessType.other')} onPress={() => setTypeOpen(true)} icon="storefront-outline" />
      <PickerField
        label={tr('onboarding:business.plan')}
        value={planInfo(draft.plan).name}
        onPress={() => setPlanOpen(true)}
        icon="star-circle-outline"
        hint={
          moduleSetFor(draft.plan) === 'full'
            ? tr('onboarding:business.planHintFull')
            : tr('onboarding:business.planHintSales')
        }
      />

      <TextField
        label={tr('onboarding:business.address')}
        value={draft.address.line1}
        onChangeText={(v) => setAddress({ line1: v })}
        placeholder={tr('onboarding:business.addressPlaceholder')}
        icon="map-marker-outline"
      />

      <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
        <TextField
          label={tr('onboarding:business.city')}
          value={draft.address.city}
          onChangeText={(v) => setAddress({ city: v })}
          placeholder={tr('onboarding:business.city')}
          containerStyle={{ flex: 1 }}
          error={errors.city}
          required
        />
        <TextField
          label={tr('onboarding:business.pinCode')}
          value={draft.address.postalCode}
          onChangeText={(v) => setAddress({ postalCode: v })}
          placeholder="400001"
          keyboardType="number-pad"
          containerStyle={{ flex: 1 }}
        />
      </View>

      <PickerField
        label={tr('onboarding:business.state')}
        value={draft.address.state || undefined}
        onPress={() => setStateOpen(true)}
        icon="map-outline"
        error={errors.state}
        required
        hint={tr('onboarding:business.stateHint')}
      />

      <TextField
        label={tr('onboarding:business.email')}
        value={draft.email}
        onChangeText={(v) => set({ email: v })}
        placeholder="accounts@business.com"
        keyboardType="email-address"
        autoCapitalize="none"
        icon="email-outline"
        error={errors.email}
      />
      <TextField
        label={tr('onboarding:business.phone')}
        value={draft.phone}
        onChangeText={(v) => set({ phone: v })}
        placeholder="+91 98765 43210"
        keyboardType="phone-pad"
        icon="phone-outline"
        error={errors.phone}
      />

      <SelectSheet
        visible={typeOpen}
        onClose={() => setTypeOpen(false)}
        title={tr('onboarding:business.type')}
        options={BUSINESS_TYPES.map((b) => ({ value: b, label: tr(`onboarding:businessType.${b}` as 'onboarding:businessType.other') }))}
        value={draft.businessType}
        onSelect={(v) => set({ businessType: v })}
      />
      <SelectSheet
        visible={planOpen}
        onClose={() => setPlanOpen(false)}
        title={tr('onboarding:business.planSheetTitle')}
        subtitle="You can change this later in Settings"
        options={PLANS.map((p) => ({
          value: p.key,
          label: p.name,
          trailing: moduleSetFor(p.key) === 'full' ? tr('onboarding:business.planTrailingFull') : tr('onboarding:business.planTrailingSales'),
        }))}
        value={draft.plan}
        onSelect={(v) => set({ plan: v as PlanTier })}
      />
      <SelectSheet
        visible={stateOpen}
        onClose={() => setStateOpen(false)}
        title={tr('onboarding:business.stateSheetTitle')}
        subtitle="Where your business is registered"
        options={INDIAN_STATES.map((s) => ({ value: s.code, label: s.name, trailing: s.code }))}
        value={draft.address.stateCode}
        onSelect={(code) => {
          const s = INDIAN_STATES.find((x) => x.code === code);
          setAddress({ stateCode: code, state: s?.name ?? '' });
        }}
      />
    </WizardShell>
  );
}
