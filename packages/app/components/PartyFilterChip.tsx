import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Icon } from '@esmart/ui/components/Icon';
import { Text } from '@esmart/ui/components/Text';
import { Skeleton } from '@esmart/ui/components/Skeleton';
import { usePartyRecord } from '../remote/queries';

/**
 * A list opened for one contact (`?party=…`, from their page's "See all"): a chip naming who it is,
 * which takes the filter off when pressed. Nothing when no party is set.
 */
export function PartyFilterChip({ partyId, supplier, onClear }: { partyId: string | null | undefined; supplier?: boolean; onClear: () => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  const party = usePartyRecord(partyId ?? undefined).data;
  if (!partyId) return null;
  return (
    <Pressable
      onPress={onClear}
      accessibilityRole="button"
      accessibilityLabel={tr('common:documentList.clearPartyNamed', { name: party?.name ?? '' })}
      hitSlop={{ top: 4, bottom: 4 }}
      style={{
        height: 36,
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        paddingHorizontal: t.spacing.md,
        borderRadius: t.radius.pill,
        backgroundColor: t.c.chip,
        borderWidth: 1,
        borderColor: t.c.primary,
      }}
    >
      <Icon name={supplier ? 'truck-outline' : 'account-outline'} size={15} color={t.c.primary} />
      {party ? (
        <Text variant="caption" weight="600" tone="primary" numberOfLines={1} style={{ maxWidth: 220 }}>
          {tr(supplier ? 'common:documentList.supplierFilter' : 'common:documentList.customerFilter', { name: party.name })}
        </Text>
      ) : (
        // The contact is still on its way: a bar, not "Customer: …".
        <Skeleton height={10} width={110} radius={4} />
      )}
      <Icon name="close" size={15} color={t.c.primary} />
    </Pressable>
  );
}
