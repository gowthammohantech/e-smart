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
      toast.show(tr(picked.error === 'tooLarge' ? 'settings:company.logoTooLarge' : 'settings:company.logoBadType'), 'error');
      return;
    }
    const before = company.logoUri;
    const saved = () => toast.show(tr('settings:company.logoQueued'), 'success');
    // Not on the server yet: keep it, and it goes up after the business does.
    if (!knownToServer(company.id)) {
      queueLogo(company.id, picked.uri);
      saved();
      return;
    }
    setLocalLogo(company.id, picked.uri);
    setBusy('upload');
    try {
      await uploadLogo(company.id, picked.uri);
      useLogoQueue.getState().clear(company.id);
      toast.show(tr('settings:company.logoUpdated'), 'success');
    } catch (err) {
      if (isNetworkError(err)) {
        queueLogo(company.id, picked.uri);
        saved();
      } else {
        setLocalLogo(company.id, before);
        toast.show(err instanceof LogoError ? err.message : tr('settings:company.logoBadType'), 'error');
      }
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy('remove');
    try {
      if (waiting && !knownToServer(company.id)) {
        // Never reached the server: just forget it.
        useLogoQueue.getState().clear(company.id);
        setLocalLogo(company.id, undefined);
      } else {
        await removeLogo(company.id);
      }
      toast.show(tr('settings:company.logoRemoved'), 'success');
    } catch (err) {
      toast.show(isNetworkError(err) ? tr('settings:company.logoOffline') : err instanceof LogoError ? err.message : String(err), 'error');
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
