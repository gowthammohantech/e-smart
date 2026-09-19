import React, { useState } from 'react';
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
      name: required(draft.name, 'Business name'),
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
      title="Tell us about your business"
      subtitle="This appears on every invoice and quote you send."
      steps={onboardingSteps(draft.plan)}
      currentStep={stepIndex('business', draft.plan)}
      onPrimary={next}
    >
      <View style={{ alignItems: 'center', gap: t.spacing.sm }}>
        <Pressable
          onPress={pickLogo}
          accessibilityRole="button"
          accessibilityLabel="Add business logo"
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
          {draft.logoUri ? 'Logo selected' : 'Add your logo (optional)'}
        </Text>
      </View>

      <TextField
        label="Business name"
        value={draft.name}
        onChangeText={(v) => set({ name: v })}
        placeholder="e.g. Vertex Traders"
        error={errors.name}
        required
      />
      <TextField
        label="Legal name"
        value={draft.legalName}
        onChangeText={(v) => set({ legalName: v })}
        placeholder="As registered (optional)"
      />
      <PickerField label="Business type" value={draft.businessType} onPress={() => setTypeOpen(true)} icon="storefront-outline" />
      <PickerField
        label="Plan"
        value={planInfo(draft.plan).name}
        onPress={() => setPlanOpen(true)}
        icon="star-circle-outline"
        hint={
          moduleSetFor(draft.plan) === 'full'
            ? 'Sales, purchases, stock and expenses, with GST compliance.'
            : 'Sales with GST compliance. Upgrade any time for purchases and stock.'
        }
      />

      <TextField
        label="Address"
        value={draft.address.line1}
        onChangeText={(v) => setAddress({ line1: v })}
        placeholder="Street address"
        icon="map-marker-outline"
      />

      <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
        <TextField
          label="City"
          value={draft.address.city}
          onChangeText={(v) => setAddress({ city: v })}
          placeholder="City"
          containerStyle={{ flex: 1 }}
          error={errors.city}
          required
        />
        <TextField
          label="PIN code"
          value={draft.address.postalCode}
          onChangeText={(v) => setAddress({ postalCode: v })}
          placeholder="400001"
          keyboardType="number-pad"
          containerStyle={{ flex: 1 }}
        />
      </View>

      <PickerField
        label="State"
        value={draft.address.state || undefined}
        onPress={() => setStateOpen(true)}
        icon="map-outline"
        error={errors.state}
        required
        hint="Used to decide CGST/SGST vs IGST on your invoices."
      />

      <TextField
        label="Business email"
        value={draft.email}
        onChangeText={(v) => set({ email: v })}
        placeholder="accounts@business.com"
        keyboardType="email-address"
        autoCapitalize="none"
        icon="email-outline"
        error={errors.email}
      />
      <TextField
        label="Business phone"
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
        title="Business type"
        options={BUSINESS_TYPES.map((b) => ({ value: b, label: b }))}
        value={draft.businessType}
        onSelect={(v) => set({ businessType: v })}
      />
      <SelectSheet
        visible={planOpen}
        onClose={() => setPlanOpen(false)}
        title="Plan"
        subtitle="You can change this later in Settings"
        options={PLANS.map((p) => ({
          value: p.key,
          label: p.name,
          trailing: moduleSetFor(p.key) === 'full' ? 'Buy & sell' : 'Sell',
        }))}
        value={draft.plan}
        onSelect={(v) => set({ plan: v as PlanTier })}
      />
      <SelectSheet
        visible={stateOpen}
        onClose={() => setStateOpen(false)}
        title="State"
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
