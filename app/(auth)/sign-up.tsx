import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { AuthShell } from '@/components/AuthShell';
import { TextField, SwitchField } from '@/components/Field';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { useAppStore } from '@/store/appStore';
import { Errors, hasErrors, minLength, required, validEmail, validPhone } from '@/lib/validators';

export default function SignUp() {
  const t = useTheme();
  const { t: tr } = useTranslation(['auth', 'errors']);
  const router = useRouter();
  const signUp = useAppStore((s) => s.signUp);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<Errors<'name' | 'email' | 'phone' | 'password' | 'terms'>>({});
  const [busy, setBusy] = useState(false);

  const submit = () => {
    const next: Errors<'name' | 'email' | 'phone' | 'password' | 'terms'> = {
      name: required(name, tr('errors:field.yourName')),
      email: required(email, tr('errors:field.email')) ?? validEmail(email),
      phone: validPhone(phone),
      password: required(password, tr('errors:field.password')) ?? minLength(password, 8, tr('errors:field.password')),
      terms: accepted ? undefined : tr('auth:signUp.acceptTerms'),
    };
    setErrors(next);
    if (hasErrors(next)) return;

    setBusy(true);
    setTimeout(() => {
      signUp(name.trim(), email.trim());
      router.replace('/(onboarding)/business');
    }, 450);
  };

  return (
    <AuthShell title={tr('auth:signUp.title')} subtitle={tr('auth:signUp.subtitle')}>
      <TextField label={tr('auth:signUp.name')} value={name} onChangeText={setName} placeholder={tr('auth:signUp.namePlaceholder')} icon="account-outline" error={errors.name} required />
      <TextField
        label={tr('auth:signUp.email')}
        value={email}
        onChangeText={setEmail}
        placeholder={tr('auth:signUp.emailPlaceholder')}
        keyboardType="email-address"
        autoCapitalize="none"
        icon="email-outline"
        error={errors.email}
        required
      />
      <TextField
        label={tr('auth:signUp.mobile')}
        value={phone}
        onChangeText={setPhone}
        placeholder="+91 98765 43210"
        keyboardType="phone-pad"
        icon="cellphone"
        error={errors.phone}
        hint={tr('auth:signUp.mobileHint')}
      />
      <TextField
        label={tr('auth:signUp.password')}
        value={password}
        onChangeText={setPassword}
        placeholder={tr('auth:signUp.passwordHint')}
        secureTextEntry
        icon="lock-outline"
        error={errors.password}
        required
      />

      <View style={{ gap: 4 }}>
        <SwitchField
          label={tr('auth:signUp.acceptLabel')}
          value={accepted}
          onValueChange={setAccepted}
        />
        {errors.terms ? (
          <Text variant="caption" tone="bad">
            {errors.terms}
          </Text>
        ) : null}
      </View>

      <Button title={tr('auth:signUp.submit')} onPress={submit} loading={busy} fullWidth size="lg" />

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: t.spacing.sm }}>
        <Text variant="small" tone="muted">{tr('auth:signUp.haveAccount')}</Text>
        <Text variant="small" tone="primary" weight="600" onPress={() => router.replace('/(auth)/sign-in')}>{tr('auth:signUp.signIn')}</Text>
      </View>
    </AuthShell>
  );
}
