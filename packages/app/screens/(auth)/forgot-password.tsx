import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { AuthShell } from '@esmart/ui/components/AuthShell';
import { TextField } from '@esmart/ui/components/Field';
import { Button } from '@esmart/ui/components/Button';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Errors, hasErrors, required, validEmail } from '@esmart/core/lib/validators';
import { isRemote, remoteSession } from '../../remote';
import { describeError } from '../../remote/errors';

export default function ForgotPassword() {
  const { t: tr } = useTranslation(['auth', 'errors']);
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Errors<'email'>>({});
  const [sent, setSent] = useState(false);

  const submit = () => {
    const next = { email: required(email, tr('errors:field.email')) ?? validEmail(email) };
    setErrors(next);
    if (hasErrors(next)) return;
    if (!isRemote()) return setSent(true);
    // The server answers the same whether or not the email is registered.
    remoteSession
      .forgotPassword(email)
      .then(() => setSent(true))
      .catch((err: unknown) => setErrors({ email: describeError(err, tr) }));
  };

  if (sent) {
    return (
      <AuthShell title={tr('auth:forgot.sentTitle')} subtitle={tr('auth:forgot.sentSubtitle', { email })}>
        <EmptyState
          illustration="mail-sent" icon="email-check-outline"
          title={tr('auth:forgot.sentBadge')}
          message={tr('auth:forgot.sentMessage')}
          actionLabel={tr('auth:forgot.backToSignIn')}
          onAction={() => router.replace('/(auth)/sign-in')}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell title={tr('auth:forgot.title')} subtitle={tr('auth:forgot.subtitle')}>
      <TextField
        label={tr('auth:forgot.email')}
        value={email}
        onChangeText={setEmail}
        placeholder={tr('auth:forgot.emailPlaceholder')}
        keyboardType="email-address"
        autoCapitalize="none"
        icon="email-outline"
        error={errors.email}
        required
      />
      <Button title={tr('auth:forgot.submit')} onPress={submit} fullWidth size="lg" />
    </AuthShell>
  );
}
