import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { AuthShell } from '@esmart/ui/components/AuthShell';
import { TextField } from '@esmart/ui/components/Field';
import { Button } from '@esmart/ui/components/Button';
import { Errors, hasErrors, minLength, required } from '@esmart/core/lib/validators';
import { ApiError } from '@esmart/api-client';
import { remoteSession } from '../../remote';
import { describeError } from '../../remote/errors';

/**
 * Opened from an invitation email: `/accept-invite?token=…`. Setting a
 * password signs the new member in; the root layout takes them to the app.
 */
export default function AcceptInvite() {
  const { t: tr } = useTranslation(['auth', 'errors']);
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors<'password'>>({});
  const [busy, setBusy] = useState(false);

  const submit = () => {
    const next = { password: required(password, tr('errors:field.password')) ?? minLength(password, 8, tr('errors:field.password')) };
    setErrors(next);
    if (hasErrors(next) || !token) return;
    setBusy(true);
    remoteSession.acceptInvite(String(token), password).catch((err: unknown) => {
      setBusy(false);
      setErrors({ password: err instanceof ApiError && (err.status === 404 || err.status === 410 || err.status === 400) ? tr('auth:invite.invalid') : describeError(err, tr) });
    });
  };

  return (
    <AuthShell title={tr('auth:invite.title')} subtitle={tr('auth:invite.subtitle')}>
      <TextField
        label={tr('auth:invite.password')}
        value={password}
        onChangeText={setPassword}
        placeholder={tr('auth:signUp.passwordHint')}
        secureTextEntry
        icon="lock-outline"
        error={errors.password ?? (token ? undefined : tr('auth:invite.invalid'))}
        required
      />
      <Button title={tr('auth:invite.submit')} onPress={submit} loading={busy} disabled={!token} fullWidth size="lg" />
    </AuthShell>
  );
}
