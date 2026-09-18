import React, { useState } from 'react';
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
      name: required(name, 'Your name'),
      email: required(email, 'Email') ?? validEmail(email),
      phone: validPhone(phone),
      password: required(password, 'Password') ?? minLength(password, 8, 'Password'),
      terms: accepted ? undefined : 'Please accept the terms to continue',
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
    <AuthShell title="Create your account" subtitle="One account can hold as many businesses as you need.">
      <TextField label="Your name" value={name} onChangeText={setName} placeholder="Full name" icon="account-outline" error={errors.name} required />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@business.com"
        keyboardType="email-address"
        autoCapitalize="none"
        icon="email-outline"
        error={errors.email}
        required
      />
      <TextField
        label="Mobile number"
        value={phone}
        onChangeText={setPhone}
        placeholder="+91 98765 43210"
        keyboardType="phone-pad"
        icon="cellphone"
        error={errors.phone}
        hint="Used for OTP sign-in and payment alerts."
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder="At least 8 characters"
        secureTextEntry
        icon="lock-outline"
        error={errors.password}
        required
      />

      <View style={{ gap: 4 }}>
        <SwitchField
          label="I accept the terms and privacy policy"
          value={accepted}
          onValueChange={setAccepted}
        />
        {errors.terms ? (
          <Text variant="caption" tone="bad">
            {errors.terms}
          </Text>
        ) : null}
      </View>

      <Button title="Create account" onPress={submit} loading={busy} fullWidth size="lg" />

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: t.spacing.sm }}>
        <Text variant="small" tone="muted">
          Already have an account?
        </Text>
        <Text variant="small" tone="primary" weight="600" onPress={() => router.replace('/(auth)/sign-in')}>
          Sign in
        </Text>
      </View>
    </AuthShell>
  );
}
