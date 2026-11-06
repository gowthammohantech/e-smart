import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Card } from '@esmart/ui/components/Card';
import { CompanyLogo } from '@esmart/ui/components/CompanyLogo';
import { Button } from '@esmart/ui/components/Button';
import { Text } from '@esmart/ui/components/Text';
import { useToast } from '@esmart/ui/components/Toast';
import { isNetworkError } from '../../remote/api';
import { LogoError, queueLogo, removeLogo, setLocalLogo, uploadLogo } from '../../remote/logo';
import { useLogoQueue } from '../../remote/logoQueue';
import { knownToServer } from '../../remote/meta';
import { useActiveCompany, useCurrentUser } from '../../store/selectors';
import { pickLogo } from './pickLogo';

/**
 * The business logo on the business profile: the current one, with change and
 * remove. A change shows at once and uploads in the background; with no
 * connection (or before the business has reached the server) it is kept and
 * uploads by itself later.
 */
export function LogoSection() {
  const t = useTheme();
  const { t: tr } = useTranslation(['settings']);
  const toast = useToast();
  const company = useActiveCompany();
  const user = useCurrentUser();
  const pending = useLogoQueue((s) => (company ? s.pending[company.id] : undefined));
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);

  // The server only lets owners and admins change it.
  if (!company || !(user?.role === 'owner' || user?.role === 'admin')) return null;

  const hasLogo = !!company.logoUri;
  const waiting = !!pending && !pending.failed;

  const choose = async () => {
    const picked = await pickLogo();
    if (!picked) return;
    if ('error' in picked) {
      toast.show(tr(picked.error === 'tooLarge' ? 'settings:company.logoTooLarge' : 'settings:company.logoBadType'), 'warning', { icon: 'image-off-outline' });
      return;
    }
    const before = company.logoUri;
    // Not on the server yet: keep it, and it goes up after the business does.
    if (!knownToServer(company.id)) {
      queueLogo(company.id, picked.uri);
      toast.show(tr('settings:company.logoQueued'), 'info', { icon: 'cloud-upload-outline', detail: company.name });
      return;
    }
    setLocalLogo(company.id, picked.uri);
    setBusy('upload');
    try {
      // No connection is not a failure: the logo waits and goes up later.
      const sent = await toast.promise(
        uploadLogo(company.id, picked.uri).then(
          () => 'uploaded' as const,
          (err: unknown) => {
            if (isNetworkError(err)) return 'queued' as const;
            throw err;
          },
        ),
        {
          loading: tr('settings:company.logoUploading'),
          success: (r) => ({ text: tr(r === 'uploaded' ? 'settings:company.logoUpdated' : 'settings:company.logoQueued'), detail: company.name }),
          error: (err) => (err instanceof LogoError ? err.message : tr('settings:company.logoBadType')),
          icon: 'image-check-outline',
        },
      );
      if (sent === 'uploaded') useLogoQueue.getState().clear(company.id);
      else queueLogo(company.id, picked.uri);
    } catch {
      setLocalLogo(company.id, before);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy('remove');
    try {
      await toast.promise(
        (async () => {
          if (waiting && !knownToServer(company.id)) {
            // Never reached the server: just forget it.
            useLogoQueue.getState().clear(company.id);
            setLocalLogo(company.id, undefined);
          } else {
            await removeLogo(company.id);
          }
        })(),
        {
          loading: tr('settings:company.logoRemoving'),
          success: { text: tr('settings:company.logoRemoved'), detail: company.name },
          error: (err) => (isNetworkError(err) ? tr('settings:company.logoOffline') : err instanceof LogoError ? err.message : String(err)),
          icon: 'image-remove',
        },
      );
    } catch {
      // The toast has said what went wrong.
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card variant="flat" style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.lg }}>
      <View>
        <CompanyLogo uri={company.logoUri} name={company.name} size={72} />
        {busy === 'upload' || waiting ? (
          <View
            style={{ position: 'absolute', inset: 0, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' }}
            accessibilityLabel={tr('settings:company.logoUploading')}
          >
            <ActivityIndicator color="#fff" />
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, gap: t.spacing.sm }}>
        <Text variant="caption" tone={pending?.failed ? 'bad' : 'muted'} style={{ lineHeight: 18 }}>
          {pending?.failed ? tr('settings:company.logoFailed', { reason: pending.failed }) : tr('settings:company.logoHint')}
        </Text>
        <View style={{ flexDirection: 'row', gap: t.spacing.md, flexWrap: 'wrap' }}>
          <Button
            title={hasLogo ? tr('settings:company.logoChange') : tr('settings:company.logoAdd')}
            variant="secondary"
            size="sm"
            icon="image-plus"
            onPress={choose}
            disabled={busy !== null}
          />
          {hasLogo ? <Button title={tr('settings:company.logoRemove')} variant="ghost" size="sm" onPress={remove} disabled={busy !== null} /> : null}
        </View>
      </View>
    </Card>
  );
}
