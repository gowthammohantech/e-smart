import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Avatar } from '@/components/Avatar';
import { TextField } from '@/components/Field';
import { ListRow } from '@/components/ListRow';
import { useToast } from '@/components/Toast';
import { useAppStore } from '@/store/appStore';
import { useCompanies, useCurrentUser } from '@/store/selectors';
import { Errors, hasErrors, required, validEmail, validPhone } from '@/lib/validators';

export default function Profile() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const user = useCurrentUser();
  const companies = useCompanies();
  const saveUser = useAppStore((s) => s.saveUser);
  const setActiveCompany = useAppStore((s) => s.setActiveCompany);
  const activeCompanyId = useAppStore((s) => s.activeCompanyId);

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [errors, setErrors] = useState<Errors<'name' | 'email' | 'phone'>>({});

  const save = () => {
    const next: Errors<'name' | 'email' | 'phone'> = {
      name: required(name, 'Name'),
      email: required(email, 'Email') ?? validEmail(email),
      phone: validPhone(phone),
    };
    setErrors(next);
    if (hasErrors(next) || !user) return;
    saveUser({ ...user, name: name.trim(), email: email.trim(), phone: phone.trim() || undefined });
    toast.show('Profile updated', 'success');
    router.back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Your profile' }} />

      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl, gap: t.spacing.lg }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Card style={{ alignItems: 'center', gap: t.spacing.sm, paddingVertical: t.spacing.xl }}>
          <Avatar name={user?.name ?? 'You'} size={72} color={user?.avatarColor} />
          <Text variant="title" weight="700">
            {user?.name}
          </Text>
          <Badge label={user?.role ?? 'owner'} tone="info" />
        </Card>

        <TextField label="Name" value={name} onChangeText={setName} icon="account-outline" error={errors.name} required />
        <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" icon="email-outline" error={errors.email} required />
        <TextField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" icon="cellphone" error={errors.phone} />

        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
          Your businesses
        </Text>
        <Card padded={false}>
          {companies.map((c, i) => (
            <ListRow
              key={c.id}
              title={c.name}
              subtitle={`${c.businessType} · ${c.baseCurrency}`}
              icon="domain"
              divider={i < companies.length - 1}
              right={c.id === activeCompanyId ? <Badge label="Active" tone="success" size="sm" /> : undefined}
              onPress={() => {
                setActiveCompany(c.id);
                toast.show(`Switched to ${c.name}`, 'success');
              }}
            />
          ))}
        </Card>
      </ScrollView>

      <View
        style={{
          padding: t.spacing.lg,
          paddingBottom: insets.bottom + t.spacing.md,
          borderTopWidth: 1,
          borderTopColor: t.c.line,
          backgroundColor: t.c.paper,
        }}
      >
        <Button title="Save changes" onPress={save} fullWidth size="lg" />
      </View>
    </KeyboardAvoidingView>
  );
}
