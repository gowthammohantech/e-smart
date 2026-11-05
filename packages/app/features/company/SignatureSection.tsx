import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Card } from '@esmart/ui/components/Card';
import { Button } from '@esmart/ui/components/Button';
import { Icon } from '@esmart/ui/components/Icon';
import { Text } from '@esmart/ui/components/Text';
import { useToast } from '@esmart/ui/components/Toast';
import { isNetworkError } from '../../remote/api';
import { LogoError } from '../../remote/logo';
import { removeSignature, uploadSignature } from '../../remote/signature';
import { useActiveCompany, useCurrentUser } from '../../store/selectors';
import { pickLogo } from './pickLogo';

/**
 * The authorised signatory's signature on the business profile: shown on
 * white, as it prints, with add, change and remove. Owners and admins only,
 * as the server allows; online only.
 */
export function SignatureSection() {
  const t = useTheme();
  const { t: tr } = useTranslation(['settings']);
  const toast = useToast();
  const company = useActiveCompany();
  const user = useCurrentUser();
  const [busy, setBusy] = useState(false);
  if (!company || !(user?.role === 'owner' || user?.role === 'admin')) return null;

  const errorText = (err: unknown) =>
    isNetworkError(err) ? tr('settings:company.signatureOffline') : err instanceof LogoError ? err.message : tr('settings:company.logoBadType');

  const choose = async () => {
    const picked = await pickLogo();
    if (!picked) return;
    if ('error' in picked) {
      toast.show(tr(picked.error === 'tooLarge' ? 'settings:company.logoTooLarge' : 'settings:company.logoBadType'), 'warning', { icon: 'image-off-outline' });
      return;
    }
    setBusy(true);
    await toast
      .promise(uploadSignature(company.id, picked.uri), {
        loading: tr('settings:company.signatureUploading'),
        success: { text: tr('settings:company.signatureUpdated'), detail: company.name },
        error: errorText,
        icon: 'signature',
      })
      .catch(() => {})
      .finally(() => setBusy(false));
  };

  const remove = async () => {
    setBusy(true);
    await toast
      .promise(removeSignature(company.id), {
        loading: tr('settings:company.signatureRemove'),
        success: { text: tr('settings:company.signatureRemoved'), detail: company.name },
        error: errorText,
        icon: 'image-remove',
      })
      .catch(() => {})
      .finally(() => setBusy(false));
  };

  return (
    <Card variant="flat" style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.lg }}>
      {/* On white, as it prints on the page. */}
      <View
        style={{
          width: 120,
          height: 60,
          borderRadius: t.radius.md,
          borderWidth: 1,
          borderColor: t.c.line,
          backgroundColor: '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {company.signatureUri ? (
          <Image source={{ uri: company.signatureUri }} style={{ width: 112, height: 52 }} contentFit="contain" accessibilityLabel={tr('settings:company.signature')} />
        ) : (
          <Icon name="signature" size={22} color="#98A2B3" />
        )}
      </View>
      <View style={{ flex: 1, gap: t.spacing.sm }}>
        <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
          {tr('settings:company.signatureHint')}
        </Text>
        <View style={{ flexDirection: 'row', gap: t.spacing.md, flexWrap: 'wrap' }}>
          <Button
            title={company.signatureUri ? tr('settings:company.signatureChange') : tr('settings:company.signatureAdd')}
            variant="secondary"
            size="sm"
            icon="signature"
            onPress={choose}
            loading={busy}
          />
          {company.signatureUri ? <Button title={tr('settings:company.signatureRemove')} variant="ghost" size="sm" onPress={remove} disabled={busy} /> : null}
        </View>
      </View>
    </Card>
  );
}
