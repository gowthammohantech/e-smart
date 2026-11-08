import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@esmart/ui/components/Icon';
import { CompanyLogo } from '@esmart/ui/components/CompanyLogo';
import { pickLogo } from '../../features/company/pickLogo';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { WizardShell } from '@esmart/ui/components/WizardShell';
import { TextField, PickerField, PhoneField, focusFirstInvalid } from '@esmart/ui/components/Field';
import { useToast } from '@esmart/ui/components/Toast';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { CityField } from '@esmart/ui/components/pickers/CityField';
import { Text } from '@esmart/ui/components/Text';
import { FieldRow } from '@esmart/ui/components/Layout';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { nextStepRoute, onboardingSteps, stepIndex, useOnboardingStore } from '../../store/onboardingStore';
import { BUSINESS_TYPES, INDIAN_STATES } from '@esmart/core/data/masters';
import { citiesForState } from '@esmart/core/data/cities';
import { moduleSetFor, planInfo } from '@esmart/core/domain/plan';
import { Errors, hasErrors, required, validEmail, validPostalCode } from '@esmart/core/lib/validators';
import { validPhoneParts } from '@esmart/core/lib/phone';

export default function BusinessStep() {
  const t = useTheme();
  const { t: tr } = useTranslation(['errors', 'onboarding', 'common']);
  const router = useRouter();
  const { draft, set, setAddress } = useOnboardingStore();
  const desktop = useIsDesktop();
  const toast = useToast();

  const [typeOpen, setTypeOpen] = useState(false);
  const [stateOpen, setStateOpen] = useState(false);
  type Key = 'name' | 'city' | 'state' | 'email' | 'phone' | 'postalCode';
  const [errors, setErrors] = useState<Errors<Key>>({});
  // A field's error goes as soon as it is edited, so the form doesn't keep saying what's already fixed.
  const clear = (key: Key) => setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));

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
      city: required(draft.address.city, tr('onboarding:business.city')),
      state: required(draft.address.state, tr('onboarding:business.state')),
      email: validEmail(draft.email),
      phone: validPhoneParts(draft.phoneDialCode, draft.phone),
      postalCode: validPostalCode(draft.address.postalCode, draft.address.country, draft.address.stateCode),
    };
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) {
      // The field may be off screen on a phone: say what's wrong and go to it.
      const first = Object.values(nextErrors).find(Boolean);
      if (first) toast.show(first, 'error');
      focusFirstInvalid();
      return;
    }
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
            <CompanyLogo uri={draft.logoUri} name={draft.name || tr('common:component.business')} size={84} />
          ) : (
            <Icon name="image-plus" size={26} color={t.c.muted} />
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
              <Pressable onPress={chooseLogo} accessibilityRole="button" hitSlop={12} style={{ paddingVertical: t.spacing.xs }}>
                <Text variant="small" tone="primary" weight="600">
                  {tr('onboarding:business.logoChange')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                hitSlop={12}
                style={{ paddingVertical: t.spacing.xs }}
                onPress={() => {
                  setLogoError(undefined);
                  set({ logoUri: undefined });
                }}
              >
                <Text variant="small" tone="muted" weight="600">
                  {tr('onboarding:business.logoRemove')}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>

      <FieldRow>
      <TextField
        label={tr('onboarding:business.name')}
        value={draft.name}
        onChangeText={(v) => {
          set({ name: v });
          clear('name');
        }}
        autoCapitalize="words"
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
      {/* Every business starts on Free, so there is nothing to pick: the plan is shown, and changed later in Settings. */}
      <TextField
        label={tr('onboarding:business.plan')}
        value={planInfo('free').name}
        editable={false}
        icon="star-circle-outline"
        hint={moduleSetFor('free') === 'full' ? tr('onboarding:business.planHintFull') : tr('onboarding:business.planHintSales')}
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
          onChange={(v) => {
            setAddress({ city: v });
            clear('city');
          }}
          stateCode={draft.address.stateCode}
          containerStyle={{ flex: 1 }}
          error={errors.city}
          required
        />
        <TextField
          label={tr('onboarding:business.pinCode')}
          value={draft.address.postalCode}
          onChangeText={(v) => {
            setAddress({ postalCode: draft.address.country === 'IN' ? v.replace(/[^0-9]/g, '') : v });
            clear('postalCode');
          }}
          placeholder="400001"
          keyboardType="number-pad"
          autoComplete="postal-code"
          textContentType="postalCode"
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
        onChangeText={(v) => {
          set({ email: v });
          clear('email');
        }}
        autoComplete="email"
        textContentType="emailAddress"
        autoCorrect={false}
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
        onChangeText={(v) => {
          set({ phone: v });
          clear('phone');
        }}
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
          clear('state');
        }}
      />
    </WizardShell>
  );
}
