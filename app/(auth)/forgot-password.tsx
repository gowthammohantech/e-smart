import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { AuthShell } from '@/components/AuthShell';
import { TextField } from '@/components/Field';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Errors, hasErrors, required, validEmail } from '@/lib/validators';

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Errors<'email'>>({});
  const [sent, setSent] = useState(false);

  const submit = () => {
    const next = { email: required(email, 'Email') ?? validEmail(email) };
    setErrors(next);
    if (hasErrors(next)) return;
    setSent(true);
  };

  if (sent) {
    return (
      <AuthShell title="Check your inbox" subtitle={`We sent reset instructions to ${email}.`}>
        <EmptyState
          icon="email-check-outline"
          title="Reset link sent"
          message="Open the link on this device to choose a new password. It expires in 30 minutes."
          actionLabel="Back to sign in"
          onAction={() => router.replace('/(auth)/sign-in')}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a secure link to set a new one.">
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
      <Button title="Send reset link" onPress={submit} fullWidth size="lg" />
    </AuthShell>
  );
}
