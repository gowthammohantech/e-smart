import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { WizardShell } from '@/components/WizardShell';
import { TextField } from '@/components/Field';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { ONBOARDING_STEPS, useOnboardingStore } from '@/store/onboardingStore';

export default function BranchesStep() {
  const t = useTheme();
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
      title="Locations"
      subtitle="Add a branch or warehouse if you operate from more than one place. You can skip this."
      steps={ONBOARDING_STEPS}
      currentStep={4}
      primaryLabel="Finish setup"
      onPrimary={() => router.push('/(onboarding)/done')}
      onSkip={() => router.push('/(onboarding)/done')}
    >
      <Card variant="flat" style={{ gap: t.spacing.sm, flexDirection: 'row', alignItems: 'center' }}>
        <MaterialCommunityIcons name="office-building-outline" size={20} color={t.c.primary} />
        <View style={{ flex: 1 }}>
          <Text variant="body" weight="600">
            Head office
          </Text>
          <Text variant="caption" tone="muted">
            {draft.address.city || 'Primary location'} · created automatically
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
        <TextField label="Branch name" value={name} onChangeText={setName} placeholder="e.g. Pune warehouse" icon="warehouse" />
        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <TextField
            label="Code"
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase().slice(0, 5))}
            placeholder="PUN"
            autoCapitalize="characters"
            containerStyle={{ flex: 1 }}
          />
          <TextField label="City" value={city} onChangeText={setCity} placeholder="Pune" containerStyle={{ flex: 1 }} />
        </View>
        <Button title="Add branch" variant="secondary" icon="plus" onPress={add} disabled={!name.trim()} />
      </View>
    </WizardShell>
  );
}
