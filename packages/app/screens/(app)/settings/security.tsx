import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { LoadFailed } from '../../../features/company/LoadFailed';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { TextField } from '@esmart/ui/components/Field';
import { QrCode } from '@esmart/ui/components/QrCode';
import { Text } from '@esmart/ui/components/Text';
import { useToast } from '@esmart/ui/components/Toast';
import { FormContainer } from '@esmart/ui/components/Layout';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { api } from '../../../remote/api';
import { describeError } from '../../../remote/errors';
import { Skeleton, SkeletonGroup } from '@esmart/ui/components/Skeleton';

type Step = { kind: 'idle' } | { kind: 'scan'; secret: string; uri: string } | { kind: 'codes'; codes: string[] } | { kind: 'disable' };

/**
 * Sign-in with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…): set
 * up by scanning a code, kept with ten recovery codes shown once, turned off with a code.
 */
export default function SecurityScreen() {
  const t = useTheme();
  const toast = useToast();
  const { t: tr } = useTranslation(['settings', 'nav']);
  const status = useQuery({
    queryKey: ['me', 'mfa'],
    queryFn: async () => (await api.GET('/me/mfa')).data!,
  });
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (job: () => Promise<void>) => {
    setBusy(true);
    try {
      await job();
    } catch (err) {
      toast.show(describeError(err, tr), 'error');
    } finally {
      setBusy(false);
    }
  };
  const start = () =>
    run(async () => {
      const { data, error } = await api.POST('/me/mfa/enrollment');
      if (error || !data) throw error;
      setStep({ kind: 'scan', secret: data.secret!, uri: data.otpauthUri! });
    });
  const confirm = () =>
    run(async () => {
      const { data, error } = await api.POST('/me/mfa/enrollment/confirm', { body: { code: code.trim() } });
      if (error || !data) throw error;
      setCode('');
      setStep({ kind: 'codes', codes: data.recoveryCodes ?? [] });
      void status.refetch();
    });
  const disable = () =>
    run(async () => {
      const { error } = await api.DELETE('/me/mfa', { body: { code: code.trim() } });
      if (error) throw error;
      setCode('');
      setStep({ kind: 'idle' });
      toast.show(tr('settings:security.turnedOff'), 'success', { icon: 'shield-check-outline' });
      void status.refetch();
    });

  const enrolled = !!status.data?.enrolled;
  // Turn on / Turn off only once the server has said which applies.
  const known = !!status.data;
  return (
    <FormContainer>
      <Stack.Screen options={{ title: tr('settings:security.title') }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.lg }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        {!known && status.isError ? (
          <Card padded={false}>
            <LoadFailed onRetry={status.refetch} compact />
          </Card>
        ) : (
        <Card style={{ gap: t.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.spacing.md }}>
            <Text variant="body" weight="600">
              {tr('settings:security.authenticator')}
            </Text>
            {/* Not yet known: no "off" badge until the server says so. */}
            {!known ? (
              <SkeletonGroup>
                <Skeleton height={20} width={44} radius={10} />
              </SkeletonGroup>
            ) : (
              <Badge label={enrolled ? tr('settings:security.on') : tr('settings:security.off')} tone={enrolled ? 'success' : 'neutral'} size="sm" />
            )}
          </View>
          {known ? (
            <Text variant="small" tone="muted">
              {tr(enrolled ? 'settings:security.onBody' : 'settings:security.offBody')}
            </Text>
          ) : null}
          {enrolled ? (
            <Text variant="caption" tone="muted">
              {tr('settings:security.codesLeft', { count: status.data?.recoveryCodesLeft ?? 0 })}
            </Text>
          ) : null}
        </Card>
        )}

        {step.kind === 'idle' && known && !enrolled ? <Button title={tr('settings:security.turnOn')} icon="shield-check-outline" onPress={() => void start()} loading={busy} /> : null}
        {step.kind === 'idle' && enrolled ? <Button title={tr('settings:security.turnOff')} variant="danger" onPress={() => setStep({ kind: 'disable' })} /> : null}

        {step.kind === 'scan' ? (
          <Card style={{ gap: t.spacing.md, alignItems: 'center' }}>
            <Text variant="small">{tr('settings:security.scan')}</Text>
            <QrCode value={step.uri} size={200} accessibilityLabel={tr('settings:security.qrLabel')} />
            <Text variant="caption" tone="muted" selectable>
              {tr('settings:security.manual', { secret: step.secret })}
            </Text>
            <View style={{ alignSelf: 'stretch', gap: t.spacing.md }}>
              <TextField label={tr('settings:security.code')} value={code} onChangeText={setCode} keyboardType="number-pad" />
              <Button title={tr('settings:security.confirm')} onPress={() => void confirm()} loading={busy} disabled={busy || code.trim().length < 6} />
              <Button
                title={tr('settings:security.cancel')}
                variant="ghost"
                onPress={() => {
                  setCode('');
                  setStep({ kind: 'idle' });
                }}
              />
            </View>
          </Card>
        ) : null}

        {step.kind === 'codes' ? (
          <Card style={{ gap: t.spacing.sm }}>
            <Text variant="body" weight="600">
              {tr('settings:security.codesTitle')}
            </Text>
            <Text variant="small" tone="muted">
              {tr('settings:security.codesBody')}
            </Text>
            <Text variant="body" selectable style={{ fontFamily: 'monospace', lineHeight: 24 }}>
              {step.codes.join('\n')}
            </Text>
            <Button
              title={tr('settings:security.copyCodes')}
              icon="content-copy"
              variant="secondary"
              onPress={() =>
                void Clipboard.setStringAsync(step.codes.join('\n')).then(() => toast.show(tr('settings:security.codesCopied'), 'success', { icon: 'content-copy' }))
              }
            />
            <Button title={tr('settings:security.codesSaved')} onPress={() => setStep({ kind: 'idle' })} />
          </Card>
        ) : null}

        {step.kind === 'disable' ? (
          <Card style={{ gap: t.spacing.md }}>
            <Text variant="small">{tr('settings:security.disableBody')}</Text>
            <TextField label={tr('settings:security.codeOrRecovery')} value={code} onChangeText={setCode} autoCapitalize="none" />
            <Button title={tr('settings:security.turnOff')} variant="danger" onPress={() => void disable()} loading={busy} disabled={busy || code.trim().length < 6} />
            <Button title={tr('settings:security.cancel')} variant="ghost" onPress={() => setStep({ kind: 'idle' })} />
          </Card>
        ) : null}
      </ScrollView>
    </FormContainer>
  );
}
