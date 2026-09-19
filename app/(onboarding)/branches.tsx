import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { WizardShell } from '@/components/WizardShell';
import { TextField } from '@/components/Field';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { nextStepRoute, onboardingSteps, stepIndex, useOnboardingStore } from '@/store/onboardingStore';

export default function BranchesStep() {
  const t = useTheme();
  const { t: tr } = useTranslation(['onboarding']);
  const router = useRouter();
  const { draft, set } = useOnboardingStore();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [city, setCity] = useState('');

  const add = () => {
    if (!name.trim()) return;
    set({
      branches: [...draft.branches, { name: name.trim(), code: (code || name.slice(0, 3)).toUpperCase(), city: city.trim() }],
    });
    setName('');
    setCode('');
    setCity('');
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
              {b.code}
              {b.city ? ` · ${b.city}` : ''}
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
          <TextField label={tr('onboarding:branches.city')} value={city} onChangeText={setCity} placeholder={tr('onboarding:branches.cityPlaceholder')} containerStyle={{ flex: 1 }} />
        </View>
        <Button title={tr('onboarding:branches.add')} variant="secondary" icon="plus" onPress={add} disabled={!name.trim()} />
      </View>
    </WizardShell>
  );
}
