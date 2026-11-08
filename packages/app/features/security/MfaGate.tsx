import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { TextField } from '@esmart/ui/components/Field';
import { Text } from '@esmart/ui/components/Text';
import { api } from '../../remote/api';
import { describeError } from '../../remote/errors';
import { queryClient } from '../../remote/queries';
import { refreshSoon } from '../../remote/refresh';
import { useAppStore } from '../../store/appStore';
import { useSignOut } from '../session/useSignOut';
import { useMfaGate } from './mfaGateStore';

/**
 * Mounted once at the root, so it also asks while signing in (the session is held before /me).
 * Asks for the code from the authenticator app when the server holds this session for it. Nothing
 * else reaches the server until it passes, so the screens behind wait; once through, they refetch.
 */
export function MfaGate() {
  const t = useTheme();
  const { t: tr } = useTranslation(['settings', 'common']);
  const required = useMfaGate((s) => s.required);
  const clear = useMfaGate((s) => s.clear);
  const cancel = useMfaGate((s) => s.cancel);
  const authenticated = useAppStore((s) => s.session.authenticated);
  const signOut = useSignOut();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const { error: problem } = await api.POST('/me/mfa/verify', { body: { code: code.trim() } });
      if (problem) throw problem;
      setCode('');
      clear();
      void queryClient.invalidateQueries();
      refreshSoon(0);
    } catch (err) {
      setError(describeError(err, tr));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={required} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: t.spacing.lg }}>
        <Card style={{ gap: t.spacing.md, maxWidth: 420, width: '100%', alignSelf: 'center' }}>
          <Text variant="title" weight="700">
            {tr('settings:security.gateTitle')}
          </Text>
          <Text variant="small" tone="muted">
            {tr('settings:security.gateBody')}
          </Text>
          <TextField
            label={tr('settings:security.code')}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoFocus
            error={error ?? undefined}
            onSubmitEditing={() => void submit()}
          />
          <Button title={tr('settings:security.verify')} onPress={() => void submit()} loading={busy} disabled={busy || code.trim().length < 6} fullWidth />
          <Button title={tr('settings:devices.signOut')} variant="ghost" onPress={() => {
              setCode('');
              setError(null);
              // Mid sign-in, giving up ends the held session and leaves the person on the sign-in screen.
              cancel();
              if (authenticated) signOut();
            }} />
        </Card>
      </View>
    </Modal>
  );
}
