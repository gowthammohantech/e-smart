import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Card } from '@esmart/ui/components/Card';
import { Button } from '@esmart/ui/components/Button';
import { Icon } from '@esmart/ui/components/Icon';
import { Sheet } from '@esmart/ui/components/Sheet';
import { Text } from '@esmart/ui/components/Text';
import { useToast } from '@esmart/ui/components/Toast';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { isNetworkError } from '../../remote/api';
import { LogoError } from '../../remote/logo';
import { removeSignature, uploadSignature } from '../../remote/signature';
import { useActiveCompany, useCurrentUser } from '../../store/selectors';
import { pickLogo } from './pickLogo';

/** Black on white whatever the theme: the page it prints on. */
const PAPER = '#FFFFFF';
const INK_MUTED = '#667085';

/**
 * The authorised signatory's signature on the business profile: shown on
 * white, as it prints, with add, change and remove. A picked image is shown
 * as it will print, under "For <business>", before it is uploaded; tapping the
 * thumbnail shows it full size. Owners and admins only, as the server allows;
 * online only.
 */
export function SignatureSection() {
  const t = useTheme();
  const { t: tr } = useTranslation(['settings', 'sales', 'common']);
  const toast = useToast();
  const company = useActiveCompany();
  const user = useCurrentUser();
  // Which action is running: only its own button spins.
  const [busy, setBusy] = useState<false | 'upload' | 'remove'>(false);
  // Picked and waiting to be confirmed.
  const [pending, setPending] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);
  // Removing takes the signature off every document at once: asked first.
  const [confirmRemove, setConfirmRemove] = useState(false);
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
    setPending(picked.uri);
  };

  const confirm = async () => {
    if (!pending) return;
    const uri = pending;
    setPending(null);
    setBusy('upload');
    await toast
      .promise(uploadSignature(company.id, uri), {
        loading: tr('settings:company.signatureUploading'),
        success: { text: tr('settings:company.signatureUpdated'), detail: company.name },
        error: errorText,
        icon: 'signature',
      })
      .catch(() => {})
      .finally(() => setBusy(false));
  };

  const remove = async () => {
    setBusy('remove');
    await toast
      .promise(removeSignature(company.id), {
        loading: tr('settings:company.signatureRemoving'),
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
      <Pressable
        onPress={() => setViewing(true)}
        disabled={!company.signatureUri}
        accessibilityRole="button"
        accessibilityLabel={tr('settings:company.signatureView')}
        style={{
          width: 120,
          height: 60,
          borderRadius: t.radius.md,
          borderWidth: 1,
          borderColor: t.c.line,
          backgroundColor: PAPER,
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
      </Pressable>
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
            loading={busy === 'upload'}
            disabled={!!busy}
          />
          {company.signatureUri ? (
            <Button title={tr('settings:company.signatureRemove')} variant="ghost" size="sm" onPress={() => setConfirmRemove(true)} loading={busy === 'remove'} disabled={!!busy} />
          ) : null}
        </View>
      </View>

      <Sheet
        visible={!!pending}
        onClose={() => setPending(null)}
        title={tr('settings:company.signaturePreviewTitle')}
        subtitle={tr('settings:company.signaturePreviewHint')}
        footer={
          <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
            <Button title={tr('common:component.cancel')} variant="secondary" onPress={() => setPending(null)} style={{ flex: 1 }} />
            <Button title={tr('settings:company.signatureConfirm')} icon="check" onPress={confirm} style={{ flex: 1 }} />
          </View>
        }
      >
        {pending ? <InvoiceFooter uri={pending} company={company.name} /> : null}
      </Sheet>
      <Sheet visible={viewing} onClose={() => setViewing(false)} title={tr('settings:company.signature')}>
        {company.signatureUri ? (
          <View style={{ backgroundColor: PAPER, borderRadius: t.radius.md, borderWidth: 1, borderColor: t.c.line, padding: t.spacing.lg, marginBottom: t.spacing.lg }}>
            <Image source={{ uri: company.signatureUri }} style={{ width: '100%', aspectRatio: 2 }} contentFit="contain" accessibilityLabel={tr('settings:company.signature')} />
          </View>
        ) : null}
      </Sheet>
      <ConfirmDialog
        visible={confirmRemove}
        title={tr('settings:company.signatureRemoveTitle')}
        message={tr('settings:company.signatureRemoveBody')}
        confirmLabel={tr('settings:company.signatureRemove')}
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

/** The foot of a printed document, as documentHtml draws it: "For <business>", the signature, the signatory's line. */
function InvoiceFooter({ uri, company }: { uri: string; company: string }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['settings', 'sales']);
  return (
    <View style={{ backgroundColor: PAPER, borderRadius: t.radius.md, borderWidth: 1, borderColor: t.c.line, padding: t.spacing.xl, marginBottom: t.spacing.lg, alignItems: 'flex-end' }}>
      <View style={{ width: '70%', maxWidth: 320, alignItems: 'center', gap: t.spacing.sm }}>
        <Text variant="small" style={{ color: INK_MUTED }} numberOfLines={2} center>
          {tr('settings:company.signatureFor', { name: company })}
        </Text>
        <Image source={{ uri }} style={{ width: '100%', aspectRatio: 2.5 }} contentFit="contain" accessibilityLabel={tr('settings:company.signature')} />
        <View style={{ alignSelf: 'stretch', borderTopWidth: 1, borderTopColor: '#D0D5DD', paddingTop: t.spacing.xs }}>
          <Text variant="small" style={{ color: INK_MUTED }} center>
            {tr('sales:pdf.authorisedSignatory')}
          </Text>
        </View>
      </View>
    </View>
  );
}
