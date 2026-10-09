import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { AuthShell } from '@esmart/ui/components/AuthShell';
import { TextField, Segmented } from '@esmart/ui/components/Field';
import { Button } from '@esmart/ui/components/Button';
import { Text } from '@esmart/ui/components/Text';
import { useAppStore } from '../../store/appStore';
import { isRemote, remoteSession } from '../../remote';
import { describeError } from '../../remote/errors';
import { Errors, required, validEmail, validPhone, hasErrors } from '@esmart/core/lib/validators';

type Mode = 'email' | 'phone';

export default function SignIn() {
  const t = useTheme();
  const { t: tr } = useTranslation(['auth', 'errors']);
  const router = useRouter();
  const signIn = useAppStore((s) => s.signIn);
  const desktop = useIsDesktop();

  const [mode, setMode] = useState<Mode>('email');
  const [email, setEmail] = useState('gowtham@vertextraders.in');
  const [password, setPassword] = useState('demo1234');
  const [phone, setPhone] = useState('+91 98200 41120');
  const [errors, setErrors] = useState<Errors<'email' | 'password' | 'phone'>>({});
  const [busy, setBusy] = useState(false);

  const submitEmail = () => {
    const next: Errors<'email' | 'password'> = {
      email: required(email, tr('errors:field.email')) ?? validEmail(email),
      password: required(password, tr('errors:field.password')),
    };
    setErrors(next);
    if (hasErrors(next)) return;
    setBusy(true);
    if (isRemote()) {
      // The root layout routes on once the session and its data are in.
      remoteSession.signIn(email, password).catch((err: unknown) => {
        setBusy(false);
        setErrors({ password: describeError(err, tr) });
      });
      return;
    }
    setTimeout(() => {
      signIn(email);
      router.replace('/(app)/(tabs)');
    }, 450);
  };

  const submitPhone = () => {
    const next = { phone: required(phone, tr('errors:field.phoneNumber')) ?? validPhone(phone) };
    setErrors(next);
    if (hasErrors(next)) return;
    router.push({ pathname: '/(auth)/otp', params: { phone } });
  };

  return (
    <AuthShell title={tr('auth:signIn.title')} subtitle={tr('auth:signIn.subtitle')}>
      <Segmented
        options={[
          { value: 'email', label: tr('auth:signIn.tabEmail') },
          { value: 'phone', label: tr('auth:signIn.tabPhone') },
        ]}
        value={mode}
        onChange={(v) => {
          setMode(v as Mode);
          setErrors({});
        }}
      />

      {mode === 'email' ? (
        <View style={{ gap: t.spacing.lg }}>
          <TextField
            label={tr('auth:signIn.email')}
            value={email}
            onChangeText={setEmail}
            placeholder={tr('auth:signIn.emailPlaceholder')}
            keyboardType="email-address"
            autoCapitalize="none"
            icon="email-outline"
            error={errors.email}
          />
          <TextField
            label={tr('auth:signIn.password')}
            value={password}
            onChangeText={setPassword}
            placeholder={tr('auth:signIn.passwordPlaceholder')}
            secureTextEntry
            icon="lock-outline"
            error={errors.password}
            onSubmitEditing={submitEmail}
          />
          {desktop ? (
            <Text
              variant="small"
              tone="primary"
              weight="600"
              accessibilityRole="link"
              style={{ alignSelf: 'flex-end', marginTop: -t.spacing.sm }}
              onPress={() => router.push('/(auth)/forgot-password')}
            >
              {tr('auth:signIn.forgot')}
            </Text>
          ) : null}
          <Button title={tr('auth:signIn.submit')} onPress={submitEmail} loading={busy} fullWidth size="lg" />
          {desktop ? null : (
            <Button title={tr('auth:signIn.forgot')} variant="ghost" onPress={() => router.push('/(auth)/forgot-password')} />
          )}
        </View>
      ) : (
        <View style={{ gap: t.spacing.lg }}>
          <TextField
            label={tr('auth:signIn.mobile')}
            value={phone}
            onChangeText={setPhone}
            placeholder="+91 98765 43210"
            keyboardType="phone-pad"
            icon="cellphone"
            error={errors.phone}
            hint={tr('auth:signIn.otpHint')}
            onSubmitEditing={submitPhone}
          />
          <Button title={tr('auth:signIn.sendCode')} onPress={submitPhone} fullWidth size="lg" />
        </View>
      )}

      {/* The API has no Google sign-in yet; the demo signs straight in. */}
      {isRemote() ? null : (
      <View style={{ alignItems: 'center', gap: t.spacing.md, marginTop: t.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, alignSelf: 'stretch' }}>
          <View style={{ flex: 1, height: 1, backgroundColor: t.c.line }} />
          <Text variant="caption" tone="muted">
            or continue with
          </Text>
          <View style={{ flex: 1, height: 1, backgroundColor: t.c.line }} />
        </View>
        <Button
          title={tr('auth:signIn.google')}
          variant="ghost"
          icon="google"
          fullWidth
          onPress={() => {
            signIn('gowtham@vertextraders.in');
            router.replace('/(app)/(tabs)');
          }}
        />
      </View>
      )}

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: t.spacing.lg }}>
        <Text variant="small" tone="muted">{tr('auth:signIn.newHere')}</Text>
        <Text variant="small" tone="primary" weight="600" onPress={() => router.replace('/(auth)/sign-up')}>{tr('auth:signIn.createAccount')}</Text>
      </View>
    </AuthShell>
  );
}
