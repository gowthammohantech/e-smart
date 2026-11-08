import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Card } from '@esmart/ui/components/Card';
import { CompanyLogo } from '@esmart/ui/components/CompanyLogo';
import { Button } from '@esmart/ui/components/Button';
import { Text } from '@esmart/ui/components/Text';
import { useToast } from '@esmart/ui/components/Toast';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { isNetworkError } from '../../remote/api';
import { LogoError, removeLogo, setLocalLogo, uploadLogo } from '../../remote/logo';
import { useActiveCompany, useCurrentUser } from '../../store/selectors';
import { pickLogo } from './pickLogo';

/**
 * The business logo on the business profile: the current one, with change and
 * remove. A change shows at once while it uploads; one that doesn't go
 * through puts the old logo back and says why.
 */
export function LogoSection() {
  const t = useTheme();
  const { t: tr } = useTranslation(['settings']);
  const toast = useToast();
  const company = useActiveCompany();
  const user = useCurrentUser();
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  // Removing takes the logo off every document at once: asked first.
  const [confirmRemove, setConfirmRemove] = useState(false);

  // The server only lets owners and admins change it.
  if (!company || !(user?.role === 'owner' || user?.role === 'admin')) return null;

  const hasLogo = !!company.logoUri;

  const choose = async () => {
    const picked = await pickLogo();
    if (!picked) return;
    if ('error' in picked) {
      toast.show(tr(picked.error === 'tooLarge' ? 'settings:company.logoTooLarge' : 'settings:company.logoBadType'), 'warning', { icon: 'image-off-outline' });
      return;
    }
    const before = company.logoUri;
    setLocalLogo(company.id, picked.uri);
    setBusy('upload');
    try {
      await toast.promise(uploadLogo(company.id, picked.uri), {
        loading: tr('settings:company.logoUploading'),
        success: { text: tr('settings:company.logoUpdated'), detail: company.name },
        error: (err) => (isNetworkError(err) ? tr('settings:company.logoOffline') : err instanceof LogoError ? err.message : tr('settings:company.logoBadType')),
        icon: 'image-check-outline',
      });
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
        removeLogo(company.id),
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
        {busy === 'upload' ? (
          <View
            style={{ position: 'absolute', inset: 0, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' }}
            accessibilityLabel={tr('settings:company.logoUploading')}
          >
            <ActivityIndicator color="#fff" />
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, gap: t.spacing.sm }}>
        <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
          {tr('settings:company.logoHint')}
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
          {hasLogo ? <Button title={tr('settings:company.logoRemove')} variant="ghost" size="sm" onPress={() => setConfirmRemove(true)} disabled={busy !== null} /> : null}
        </View>
      </View>
      <ConfirmDialog
        visible={confirmRemove}
        title={tr('settings:company.logoRemoveTitle')}
        message={tr('settings:company.logoRemoveBody')}
        confirmLabel={tr('settings:company.logoRemove')}
        destructive
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          setConfirmRemove(false);
          void remove();
        }}
      />
    </Card>
  );
}
