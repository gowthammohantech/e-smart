import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AuthShell } from '@esmart/ui/components/AuthShell';
import { TextField } from '@esmart/ui/components/Field';
import { Button } from '@esmart/ui/components/Button';
import { useToast } from '@esmart/ui/components/Toast';
import { Errors, hasErrors, minLength, required } from '@esmart/core/lib/validators';
import { remoteSession } from '../../remote';
import { describeError } from '../../remote/errors';
import { ApiError } from '@esmart/api-client';

/** Opened from the password-reset email: `/reset-password?token=…`. */
export default function ResetPassword() {
  const { t: tr } = useTranslation(['auth', 'errors']);
  const router = useRouter();
  const toast = useToast();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors<'password'>>({});
  const [busy, setBusy] = useState(false);

  const submit = () => {
    const next = { password: required(password, tr('errors:field.password')) ?? minLength(password, 8, tr('errors:field.password')) };
    setErrors(next);
    if (hasErrors(next) || !token) return;
    setBusy(true);
    remoteSession
      .resetPassword(String(token), password)
      .then(() => {
        toast.show(tr('auth:reset.done'), 'success');
        router.replace('/(auth)/sign-in');
      })
      .catch((err: unknown) => {
        setBusy(false);
        setErrors({ password: err instanceof ApiError && err.status === 400 ? tr('auth:reset.invalid') : describeError(err, tr) });
      });
  };

  return (
    <AuthShell title={tr('auth:reset.title')} subtitle={tr('auth:reset.subtitle')}>
      <TextField
        label={tr('auth:reset.password')}
        value={password}
        onChangeText={setPassword}
        placeholder={tr('auth:signUp.passwordHint')}
        secureTextEntry
        icon="lock-outline"
        error={errors.password ?? (token ? undefined : tr('auth:reset.invalid'))}
        required
      />
      <Button title={tr('auth:reset.submit')} onPress={submit} loading={busy} disabled={!token} fullWidth size="lg" />
    </AuthShell>
  );
}
