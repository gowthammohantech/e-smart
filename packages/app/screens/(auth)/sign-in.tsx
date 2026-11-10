import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { AuthShell } from '@esmart/ui/components/AuthShell';
import { PhoneField, TextField, Segmented, usePhoneInput } from '@esmart/ui/components/Field';
import { Button } from '@esmart/ui/components/Button';
import { Text } from '@esmart/ui/components/Text';
import { DEMO_LOGIN, remoteSession } from '../../remote';
import { describeError } from '../../remote/errors';
import { trackAnonymous } from '../../lib/analytics';
import { useWelcomeToast } from '../../features/session/useWelcomeToast';
import { Errors, required, validEmail, hasErrors } from '@esmart/core/lib/validators';

type Mode = 'email' | 'phone';

export default function SignIn() {
  const t = useTheme();
  const { t: tr } = useTranslation(['auth', 'errors']);
  const welcome = useWelcomeToast();
  const router = useRouter();
  const desktop = useIsDesktop();

  const [mode, setMode] = useState<Mode>('email');
  // Prefilled only on builds that set EXPO_PUBLIC_DEMO_LOGIN_* (demo and sandbox deployments).
  const [email, setEmail] = useState(DEMO_LOGIN.email);
  const [password, setPassword] = useState(DEMO_LOGIN.password);
  const phone = usePhoneInput();
  const passwordRef = useRef<TextInput>(null);
  const [errors, setErrors] = useState<Errors<'email' | 'password' | 'phone'>>({});
  const [busy, setBusy] = useState(false);
  // The public demo's sign-in, from the server; null while it's off or unreachable (the button hides).
  const [demo, setDemo] = useState<{ email: string; password: string } | null>(null);
  const { demo: demoParam } = useLocalSearchParams<{ demo?: string }>();
  const autoTried = useRef(false);
  useEffect(() => {
    let live = true;
    void remoteSession.getDemoLogin().then((d) => {
      if (live) setDemo(d);
    });
    return () => {
      live = false;
    };
  }, []);
  // While signing in, the links and tabs do nothing, so the attempt isn't left behind.
  const unlessBusy = (fn: () => void) => () => {
    if (!busy) fn();
  };

  const signInWith = (who: string, secret: string) => {
    if (busy) return;
    const next: Errors<'email' | 'password'> = {
      email: required(who, tr('errors:field.email')) ?? validEmail(who),
      password: required(secret, tr('errors:field.password')),
    };
    setErrors(next);
    if (hasErrors(next)) return;
    setBusy(true);
    // The root layout routes on once the session and its data are in.
    remoteSession.signIn(who, secret).then(welcome, (err: unknown) => {
      setBusy(false);
      setErrors({ password: describeError(err, tr) });
    });
  };
  const submitEmail = () => signInWith(email, password);

  /** "Give it a try": the demo's sign-in fills the form, so it's plain what happens, then goes in. */
  const tryDemo = (via: 'button' | 'link' = 'button') => {
    if (busy || !demo) return;
    trackAnonymous('demo_started', { via });
    setMode('email');
    setEmail(demo.email);
    setPassword(demo.password);
    signInWith(demo.email, demo.password);
  };
  // A "Try the demo" link (sign-in?demo=1, from the website) goes straight in once the demo answers.
  useEffect(() => {
    if (demoParam === '1' && demo && !autoTried.current) {
      autoTried.current = true;
      tryDemo('link');
    }
    // tryDemo reads the latest state; this runs once when the demo's sign-in arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoParam, demo]);

  // The code screen sends an SMS as it opens: a double tap would open it, and send, twice.
  const openedOtp = useRef(0);
  const submitPhone = () => {
    if (Date.now() - openedOtp.current < 2000) return;
    const next = { phone: required(phone.field.value, tr('errors:field.phoneNumber')) ?? phone.error() };
    setErrors(next);
    if (hasErrors(next)) return;
    openedOtp.current = Date.now();
    router.push({ pathname: '/(auth)/otp', params: { phone: phone.value } });
  };

  return (
    <AuthShell title={tr('auth:signIn.title')} subtitle={tr('auth:signIn.subtitle')} locked={busy}>
      <Segmented
        options={[
          { value: 'email', label: tr('auth:signIn.tabEmail') },
          { value: 'phone', label: tr('auth:signIn.tabPhone') },
        ]}
        value={mode}
        onChange={(v) => {
          if (busy) return;
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
            autoCorrect={false}
            autoComplete="email"
            textContentType="username"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordRef.current?.focus()}
            icon="email-outline"
            error={errors.email}
          />
          <TextField
            // React 19 hands `ref` to TextField, which passes it on to its input.
            ref={passwordRef}
            label={tr('auth:signIn.password')}
            value={password}
            onChangeText={setPassword}
            placeholder={tr('auth:signIn.passwordPlaceholder')}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
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
              onPress={unlessBusy(() => router.push('/(auth)/forgot-password'))}
            >
              {tr('auth:signIn.forgot')}
            </Text>
          ) : null}
          <Button title={tr('auth:signIn.submit')} onPress={submitEmail} loading={busy} fullWidth />
          {desktop ? null : (
            <Button title={tr('auth:signIn.forgot')} variant="ghost" onPress={unlessBusy(() => router.push('/(auth)/forgot-password'))} />
          )}
        </View>
      ) : (
        <View style={{ gap: t.spacing.lg }}>
          <PhoneField
            label={tr('auth:signIn.mobile')}
            {...phone.field}
            placeholder="98765 43210"
            icon="cellphone"
            error={errors.phone}
            hint={tr('auth:signIn.otpHint')}
            onSubmitEditing={submitPhone}
          />
          <Button title={tr('auth:signIn.sendCode')} onPress={submitPhone} fullWidth />
        </View>
      )}

      {demo ? (
        <View style={{ gap: t.spacing.sm, marginTop: t.spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
            <View style={{ flex: 1, height: 1, backgroundColor: t.c.line }} />
            <Text variant="caption" tone="muted">{tr('auth:signIn.or')}</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: t.c.line }} />
          </View>
          <Button title={tr('auth:signIn.tryDemo')} variant="secondary" icon="rocket-launch-outline" onPress={() => tryDemo('button')} disabled={busy} fullWidth />
          <Text variant="caption" tone="muted" style={{ textAlign: 'center' }}>{tr('auth:signIn.tryDemoHint')}</Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, marginTop: t.spacing.lg }}>
        <Text variant="small" tone="muted">{tr('auth:signIn.newHere')}</Text>
        <Pressable onPress={unlessBusy(() => router.push('/(auth)/sign-up'))} hitSlop={12} accessibilityRole="link" style={{ paddingVertical: t.spacing.sm }}>
          <Text variant="small" tone="primary" weight="600">{tr('auth:signIn.createAccount')}</Text>
        </Pressable>
      </View>
    </AuthShell>
  );
}
