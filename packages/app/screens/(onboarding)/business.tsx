import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CompanyLogo } from '@esmart/ui/components/CompanyLogo';
import { pickLogo } from '../../features/company/pickLogo';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { WizardShell } from '@esmart/ui/components/WizardShell';
import { TextField, PickerField, PhoneField } from '@esmart/ui/components/Field';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { CityField } from '@esmart/ui/components/pickers/CityField';
import { Text } from '@esmart/ui/components/Text';
import { FieldRow } from '@esmart/ui/components/Layout';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { useSignOut } from '../../features/session/useSignOut';
import { nextStepRoute, onboardingSteps, stepIndex, useOnboardingStore } from '../../store/onboardingStore';
import { BUSINESS_TYPES, INDIAN_STATES } from '@esmart/core/data/masters';
import { citiesForState } from '@esmart/core/data/cities';
import { PLANS, moduleSetFor, planInfo } from '@esmart/core/domain/plan';
import type { PlanTier } from '@esmart/core/types';
import { Errors, hasErrors, required, validEmail, validPostalCode } from '@esmart/core/lib/validators';
import { validPhoneParts } from '@esmart/core/lib/phone';

export default function BusinessStep() {
  const t = useTheme();
  const { t: tr } = useTranslation(['errors', 'onboarding']);
  const router = useRouter();
  const { draft, set, setAddress } = useOnboardingStore();
  const desktop = useIsDesktop();
  const signOut = useSignOut();

  const [typeOpen, setTypeOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [stateOpen, setStateOpen] = useState(false);
  const [errors, setErrors] = useState<Errors<'name' | 'city' | 'state' | 'email' | 'phone' | 'postalCode'>>({});

  const [logoError, setLogoError] = useState<string | undefined>();

  const chooseLogo = async () => {
    setLogoError(undefined);
    const picked = await pickLogo();
    if (!picked) return;
    if ('error' in picked) {
      setLogoError(tr(picked.error === 'tooLarge' ? 'onboarding:business.logoTooLarge' : 'onboarding:business.logoBadType'));
      return;
    }
    set({ logoUri: picked.uri });
  };

  const next = () => {
    const nextErrors: Errors<'name' | 'city' | 'state' | 'email' | 'phone' | 'postalCode'> = {
      name: required(draft.name, tr('errors:field.businessName')),
      city: required(draft.address.city, 'City'),
      state: required(draft.address.state, 'State'),
      email: validEmail(draft.email),
      phone: validPhoneParts(draft.phoneDialCode, draft.phone),
      postalCode: validPostalCode(draft.address.postalCode, draft.address.country, draft.address.stateCode),
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
      onSignOut={signOut}
    >
      <View style={desktop ? { flexDirection: 'row', alignItems: 'center', gap: t.spacing.lg } : { alignItems: 'center', gap: t.spacing.sm }}>
        <Pressable
          onPress={chooseLogo}
          accessibilityRole="button"
          accessibilityLabel={draft.logoUri ? tr('onboarding:business.logoChange') : tr('onboarding:business.addLogo')}
          style={{
            width: 84,
            height: 84,
            borderRadius: 17,
            backgroundColor: t.c.card2,
            borderWidth: draft.logoUri ? 0 : 1,
            borderStyle: 'dashed',
            borderColor: t.c.line,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {draft.logoUri ? (
            <CompanyLogo uri={draft.logoUri} name={draft.name || 'Business'} size={84} />
          ) : (
            <MaterialCommunityIcons name="image-plus" size={26} color={t.c.muted} />
          )}
        </Pressable>
        <View style={{ gap: 2, alignItems: desktop ? 'flex-start' : 'center' }}>
          {desktop ? (
            <Text variant="body" weight="600">
              {tr('onboarding:business.addLogo')}
            </Text>
          ) : null}
          <Text variant="caption" tone={logoError ? 'bad' : 'muted'} center={!desktop}>
            {logoError ?? (draft.logoUri ? tr('onboarding:business.logoSelected') : tr('onboarding:business.logoOptional'))}
          </Text>
          {draft.logoUri ? (
            <View style={{ flexDirection: 'row', gap: t.spacing.lg, marginTop: 2 }}>
              <Text variant="small" tone="primary" weight="600" accessibilityRole="button" onPress={chooseLogo}>
                {tr('onboarding:business.logoChange')}
              </Text>
              <Text
                variant="small"
                tone="muted"
                weight="600"
                accessibilityRole="button"
                onPress={() => {
                  setLogoError(undefined);
                  set({ logoUri: undefined });
                }}
              >
                {tr('onboarding:business.logoRemove')}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <FieldRow>
      <TextField
        label={tr('onboarding:business.name')}
        value={draft.name}
        onChangeText={(v) => set({ name: v })}
        placeholder={tr('onboarding:business.namePlaceholder')}
        error={errors.name}
        required
      />
      <TextField
        label={tr('onboarding:business.legalName')}
        value={draft.legalName}
        onChangeText={(v) => set({ legalName: v })}
        placeholder={tr('onboarding:business.legalNamePlaceholder')}
      />
      </FieldRow>
      <FieldRow>
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
      </FieldRow>

      <TextField
        label={tr('onboarding:business.address')}
        value={draft.address.line1}
        onChangeText={(v) => setAddress({ line1: v })}
        placeholder={tr('onboarding:business.addressPlaceholder')}
        icon="map-marker-outline"
      />

      <FieldRow>
      <PickerField
        label={tr('onboarding:business.state')}
        value={draft.address.state || undefined}
        onPress={() => setStateOpen(true)}
        icon="map-outline"
        error={errors.state}
        required
        hint={tr('onboarding:business.stateHint')}
      />

      <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
        <CityField
          label={tr('onboarding:business.city')}
          value={draft.address.city}
          onChange={(v) => setAddress({ city: v })}
          stateCode={draft.address.stateCode}
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
          maxLength={draft.address.country === 'IN' ? 6 : undefined}
          error={errors.postalCode}
          containerStyle={{ flex: 1 }}
        />
      </View>
      </FieldRow>

      <FieldRow>
      <TextField
        label={tr('onboarding:business.email')}
        value={draft.email}
        onChangeText={(v) => set({ email: v })}
        placeholder={tr('onboarding:business.emailPlaceholder')}
        keyboardType="email-address"
        autoCapitalize="none"
        icon="email-outline"
        error={errors.email}
      />
      <PhoneField
        label={tr('onboarding:business.phone')}
        dialCode={draft.phoneDialCode}
        value={draft.phone}
        onChangeText={(v) => set({ phone: v })}
        placeholder="98765 43210"
        error={errors.phone}
      />
      </FieldRow>

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
        subtitle={tr('onboarding:business.changeLater')}
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
        subtitle={tr('onboarding:business.addressSubtitle')}
        options={INDIAN_STATES.map((s) => ({ value: s.code, label: s.name, trailing: s.code }))}
        value={draft.address.stateCode}
        onSelect={(code) => {
          const s = INDIAN_STATES.find((x) => x.code === code);
          const { city } = draft.address;
          // A city picked for the previous state no longer belongs.
          const keepCity = !city || citiesForState(code).includes(city);
          setAddress({ stateCode: code, state: s?.name ?? '', ...(keepCity ? {} : { city: '' }) });
        }}
      />
    </WizardShell>
  );
}
