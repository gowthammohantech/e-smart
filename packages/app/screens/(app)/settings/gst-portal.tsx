import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import type { Schema } from '@esmart/api-contract';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { TextField } from '@esmart/ui/components/Field';
import { Text } from '@esmart/ui/components/Text';
import { useToast } from '@esmart/ui/components/Toast';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { formatDate } from '@esmart/core/lib/date';
import { api } from '../../../remote/api';
import { describeError } from '../../../remote/errors';
import { useAppStore } from '../../../store/appStore';
import { useActiveCompany } from '../../../store/selectors';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { SkeletonGroup, SkeletonRows } from '@esmart/ui/components/Skeleton';
import { LoadFailed } from '../../../features/company/LoadFailed';

type Session = Schema<'GstPortalSession'>;

/**
 * The taxpayer's own session on the GST portal, per GSTIN: what GSTR-2B is downloaded and returns
 * filed through. Opened with their portal username and an OTP to their registered phone; online only.
 */
export default function GstPortalSettings() {
  // Keyed by business: on the web the page stays open across a switch, and what it copied or fetched
  // at mount belongs to the business it opened on.
  const companyId = useAppStore((s) => s.activeCompanyId);
  return <GstPortalSettingsBody key={companyId} />;
}

function GstPortalSettingsBody() {
  const t = useTheme();
  const { t: tr } = useTranslation(['settings', 'nav']);
  const toast = useToast();
  const company = useActiveCompany();
  const path = { companyId: company.id };
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, { username: string; otp: string; sent: boolean }>>({});

  const load = useCallback(() => {
    // A failure keeps whatever was showing, and offers a retry when nothing was.
    api.GET('/companies/{companyId}/gst/portal-sessions', { params: { path } }).then(
      ({ data, error }) => (error ? setLoadFailed(true) : setSessions(data?.data ?? [])),
      () => setLoadFailed(true),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.id]);
  useEffect(load, [load]);

  const field = (gstin: string) => form[gstin] ?? { username: sessions?.find((s) => s.gstin === gstin)?.username ?? '', otp: '', sent: false };
  const patch = (gstin: string, p: Partial<{ username: string; otp: string; sent: boolean }>) => setForm((f) => ({ ...f, [gstin]: { ...field(gstin), ...p } }));

  const run = async (gstin: string, step: () => Promise<{ error?: unknown }>, done: () => void) => {
    setBusy(gstin);
    try {
      const { error } = await step();
      if (error) toast.show(describeError(error, tr), 'error');
      else done();
    } catch (err) {
      toast.show(describeError(err, tr), 'error');
    } finally {
      setBusy(null);
    }
  };

  const sendOtp = (gstin: string) =>
    run(gstin, () => api.POST('/companies/{companyId}/gst/portal-sessions/otp', { params: { path }, body: { gstin, username: field(gstin).username.trim() } }), () => {
      patch(gstin, { sent: true });
      toast.show(tr('settings:gstPortal.otpSent'), 'success', { icon: 'message-lock-outline' });
    });
  const connect = (gstin: string) =>
    run(gstin, () => api.POST('/companies/{companyId}/gst/portal-sessions', { params: { path }, body: { gstin, otp: field(gstin).otp } }), () => {
      patch(gstin, { sent: false, otp: '' });
      toast.show(tr('settings:gstPortal.connected'), 'success', { icon: 'link-variant' });
      load();
    });
  const disconnect = (gstin: string) =>
    run(gstin, () => api.DELETE('/companies/{companyId}/gst/portal-sessions/{gstin}', { params: { path: { ...path, gstin } } }), () => {
      toast.show(tr('settings:gstPortal.disconnected'), 'success', { icon: 'link-variant-off' });
      load();
    });

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: tr('nav:title.gstPortal') }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40, gap: t.spacing.lg }} showsVerticalScrollIndicator={SHOW_SCROLLBAR} keyboardShouldPersistTaps="handled">
        <Card variant="flat" style={{ gap: t.spacing.sm }}>
          <Text variant="body" weight="600">
            {tr('settings:gstPortal.howTitle')}
          </Text>
          <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
            {tr('settings:gstPortal.how')}
          </Text>
        </Card>
        {!sessions && loadFailed ? (
          <Card padded={false}>
            <LoadFailed
              onRetry={() => {
                setLoadFailed(false);
                load();
              }}
              compact
            />
          </Card>
        ) : !sessions ? (
          <Card>
            <SkeletonGroup>
              <SkeletonRows rows={2} kind="list" />
            </SkeletonGroup>
          </Card>
        ) : null}
        {sessions && !sessions.length ? (
          <Text variant="small" tone="muted">
            {tr('settings:gstPortal.noGstin')}
          </Text>
        ) : null}
        {(sessions ?? []).map((s) => {
          const f = field(s.gstin!);
          return (
            <Card key={s.gstin} style={{ gap: t.spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: t.spacing.md }}>
                <Text variant="body" weight="700" style={{ fontVariant: ['tabular-nums'] }}>
                  {s.gstin}
                </Text>
                <Badge label={s.connected ? tr('settings:gstPortal.statusConnected') : tr('settings:gstPortal.statusOff')} tone={s.connected ? 'success' : 'neutral'} size="sm" />
              </View>
              {s.connected ? (
                <>
                  <Text variant="caption" tone="muted">
                    {tr('settings:gstPortal.until', { user: s.username, date: formatDate(s.refreshableUntil!) })}
                  </Text>
                  <Button title={tr('settings:gstPortal.disconnect')} variant="secondary" onPress={() => setConfirmDisconnect(s.gstin!)} loading={busy === s.gstin} />
                </>
              ) : (
                <>
                  <TextField label={tr('settings:gstPortal.username')} value={f.username} onChangeText={(username) => patch(s.gstin!, { username })} autoCapitalize="none" icon="account-key-outline" />
                  {f.sent ? (
                    <>
                      <TextField label={tr('settings:gstPortal.otp')} value={f.otp} onChangeText={(otp) => patch(s.gstin!, { otp: otp.replace(/\D/g, '').slice(0, 6) })} keyboardType="number-pad" maxLength={6} icon="message-lock-outline" hint={tr('settings:gstPortal.otpHint')} />
                      <Button title={tr('settings:gstPortal.connect')} onPress={() => void connect(s.gstin!)} disabled={f.otp.length !== 6} loading={busy === s.gstin} />
                    </>
                  ) : (
                    <Button title={tr('settings:gstPortal.sendOtp')} onPress={() => void sendOtp(s.gstin!)} disabled={!f.username.trim()} loading={busy === s.gstin} />
                  )}
                </>
              )}
            </Card>
          );
        })}
      </ScrollView>
      <ConfirmDialog
        visible={!!confirmDisconnect}
        title={tr('settings:gstPortal.disconnectTitle', { gstin: confirmDisconnect ?? '' })}
        message={tr('settings:gstPortal.disconnectBody')}
        confirmLabel={tr('settings:gstPortal.disconnect')}
        destructive
        onCancel={() => setConfirmDisconnect(null)}
        onConfirm={() => {
          const g = confirmDisconnect;
          setConfirmDisconnect(null);
          if (g) void disconnect(g);
        }}
      />
    </KeyboardAvoidingView>
  );
}
