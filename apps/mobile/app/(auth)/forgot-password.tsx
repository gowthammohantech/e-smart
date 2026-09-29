import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { AuthShell } from '@/components/AuthShell';
import { TextField } from '@/components/Field';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Errors, hasErrors, required, validEmail } from '@/lib/validators';

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
    setSent(true);
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
