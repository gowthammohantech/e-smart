import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { AuthShell } from '@esmart/ui/components/AuthShell';
import { PhoneField, TextField, SwitchField, usePhoneInput } from '@esmart/ui/components/Field';
import { Button } from '@esmart/ui/components/Button';
import { Text } from '@esmart/ui/components/Text';
import { remoteSession } from '../../remote';
import { describeError } from '../../remote/errors';
import { toE164 } from '../../remote/phone';
import { Errors, hasErrors, minLength, required, validEmail } from '@esmart/core/lib/validators';

export default function SignUp() {
  const t = useTheme();
  const { t: tr } = useTranslation(['auth', 'errors']);
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  // Arriving from a verified OTP, the phone is already proven and can't be changed.
  const { phone: verifiedPhone, verificationId } = useLocalSearchParams<{ phone?: string; verificationId?: string }>();
  const verified = !!(verificationId && verifiedPhone);
  const phone = usePhoneInput(verified ? verifiedPhone : undefined);
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<Errors<'name' | 'email' | 'phone' | 'password' | 'terms'>>({});
  const [busy, setBusy] = useState(false);

  const submit = () => {
    const next: Errors<'name' | 'email' | 'phone' | 'password' | 'terms'> = {
      name: required(name, tr('errors:field.yourName')),
      email: required(email, tr('errors:field.email')) ?? validEmail(email),
      phone: phone.error(),
      password: required(password, tr('errors:field.password')) ?? minLength(password, 8, tr('errors:field.password')),
      terms: accepted ? undefined : tr('auth:signUp.acceptTerms'),
    };
    setErrors(next);
    if (hasErrors(next)) return;

    setBusy(true);
    // A new account has no company yet, so the root layout routes to onboarding.
    remoteSession
      .signUp({
        name: name.trim(),
        email,
        phone: phone.value ? toE164(phone.value) : undefined,
        phoneVerificationId: verified ? verificationId : undefined,
        password,
      })
      .catch((err: unknown) => {
        setBusy(false);
        setErrors({ email: describeError(err, tr) });
      });
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
      <PhoneField
        label={tr('auth:signUp.mobile')}
        {...phone.field}
        disabled={verified}
        placeholder="98765 43210"
        icon={verified ? 'check-circle-outline' : 'cellphone'}
        error={errors.phone}
        hint={verified ? tr('auth:signUp.mobileVerified') : tr('auth:signUp.mobileHint')}
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
        onSubmitEditing={submit}
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
