import React, { useRef, useState } from 'react';
import type { TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AuthShell } from '@esmart/ui/components/AuthShell';
import { TextField } from '@esmart/ui/components/Field';
import { Button } from '@esmart/ui/components/Button';
import { useToast } from '@esmart/ui/components/Toast';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Errors, hasErrors, minLength, required } from '@esmart/core/lib/validators';
import { remoteSession } from '../../remote';
import { describeError } from '../../remote/errors';
import { ApiError } from '@esmart/api-client';
import { onMobileBrowser, openInApp } from '../../navigation/openInApp';

/**
 * Opened from the password-reset email: `/reset-password?token=…`. After the
 * new password is set the person lands on sign-in: in the app if they opened
 * the link on a phone that has it, otherwise on the web.
 */
export default function ResetPassword() {
  const { t: tr } = useTranslation(['auth', 'errors']);
  const router = useRouter();
  const toast = useToast();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors<'password' | 'confirm'>>({});
  const [busy, setBusy] = useState(false);
  // A missing, used or expired token: the only way on is a fresh email.
  const [expired, setExpired] = useState(!token);
  const confirmRef = useRef<TextInput>(null);

  const submit = () => {
    if (busy) return;
    const next: Errors<'password' | 'confirm'> = {
      password: required(password, tr('errors:field.password')) ?? minLength(password, 8, tr('errors:field.password')),
      confirm: password !== confirm ? tr('auth:reset.mismatch') : undefined,
    };
    setErrors(next);
    if (hasErrors(next) || !token) return;
    setBusy(true);
    remoteSession
      .resetPassword(String(token), password)
      .then(() => {
        toast.show(tr('auth:reset.done'), 'success', { icon: 'lock-check-outline' });
        router.replace('/(auth)/sign-in');
        if (onMobileBrowser()) openInApp('sign-in');
      })
      .catch((err: unknown) => {
        setBusy(false);
        if (err instanceof ApiError && err.status === 400) setExpired(true);
        else setErrors({ password: describeError(err, tr) });
      });
  };

  if (expired) {
    return (
      <AuthShell title={tr('auth:reset.expiredTitle')} illustration={null}>
        <EmptyState
          icon="link-variant-off"
          title={tr('auth:reset.expiredTitle')}
          message={tr('auth:reset.invalid')}
          actionLabel={tr('auth:reset.sendNew')}
          onAction={() => router.replace('/(auth)/forgot-password')}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell title={tr('auth:reset.title')} subtitle={tr('auth:reset.subtitle')} locked={busy}>
      <TextField
        label={tr('auth:reset.password')}
        value={password}
        onChangeText={setPassword}
        placeholder={tr('auth:signUp.passwordHint')}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => confirmRef.current?.focus()}
        icon="lock-outline"
        error={errors.password}
        required
      />
      <TextField
        // React 19 hands `ref` to TextField, which passes it on to its input.
        {...({ ref: confirmRef } as object)}
        label={tr('auth:reset.confirm')}
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
        icon="lock-check-outline"
        error={errors.confirm}
        required
      />
      <Button title={tr('auth:reset.submit')} onPress={submit} loading={busy} fullWidth />
    </AuthShell>
  );
}
