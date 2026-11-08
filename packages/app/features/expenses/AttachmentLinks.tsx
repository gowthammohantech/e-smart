import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Platform, Pressable, View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { Icon } from '@esmart/ui/components/Icon';
import { Text } from '@esmart/ui/components/Text';
import { useToast } from '@esmart/ui/components/Toast';
import { api } from '../../remote/api';
import { describeError } from '../../remote/errors';
import { useAppStore } from '../../store/appStore';

/** Opens an attachment from its short-lived signed URL: a new tab in a browser, the viewer on a phone. */
async function openAttachment(companyId: string, id: string) {
  const { data } = await api.GET('/companies/{companyId}/attachments/{id}', { params: { path: { companyId, id } } });
  if (!data?.uri) throw new Error('No download link');
  if (Platform.OS === 'web') window.open(data.uri, '_blank', 'noopener');
  else await Linking.openURL(data.uri);
}

/** One row per attachment (a receipt photo, a slip), each opening the file itself. */
export function AttachmentLinks({ ids }: { ids: string[] }) {
  const t = useTheme();
  const toast = useToast();
  const { t: tr } = useTranslation(['purchases', 'common']);
  const companyId = useAppStore((s) => s.activeCompanyId);
  const names = useAppStore((s) => s.attachments);
  const [opening, setOpening] = useState<string | null>(null);

  return (
    <View>
      {ids.map((id, i) => {
        const name = names.find((a) => a.id === id)?.name;
        const label = name && ids.length === 1 ? name : tr('purchases:expense.attachmentLabel', { index: i + 1 });
        return (
          <Pressable
            key={id}
            disabled={opening !== null}
            onPress={async () => {
              setOpening(id);
              try {
                await openAttachment(companyId, id);
              } catch (err) {
                toast.show(`${tr('purchases:expense.attachmentFailed')} ${describeError(err, tr)}`, 'error');
              } finally {
                setOpening(null);
              }
            }}
            accessibilityRole="link"
            accessibilityLabel={tr('purchases:expense.openAttachment', { index: i + 1 })}
            style={(state) => {
              const { pressed, hovered, focused } = state as WebPressState;
              return [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.spacing.md,
                  minHeight: 44,
                  borderRadius: t.radius.md,
                  backgroundColor: pressed || hovered ? t.c.card2 : 'transparent',
                },
                focusRing(t, focused),
              ];
            }}
          >
            <Icon name="paperclip" size={19} color={t.c.primary} />
            <Text variant="small" weight="600" tone="primary" style={{ flex: 1 }} numberOfLines={1}>
              {label}
            </Text>
            {opening === id ? <ActivityIndicator size="small" color={t.c.primary} /> : <Icon name="chevron-right" size={16} color={t.c.muted} />}
          </Pressable>
        );
      })}
    </View>
  );
}
