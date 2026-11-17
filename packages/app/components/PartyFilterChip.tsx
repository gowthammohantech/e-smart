import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Icon, type IconName } from '@esmart/ui/components/Icon';
import { Text } from '@esmart/ui/components/Text';
import { Skeleton } from '@esmart/ui/components/Skeleton';
import { useItemRecord, usePartyRecord } from '../remote/queries';

/**
 * A list narrowed to one record from its page's "See all" (`?party=…`, `?item=…`): a chip naming it,
 * which takes the filter off when pressed. A bar while the name is on its way, not "Customer: …".
 */
export function FilterChip({ icon, label, clearLabel, onClear }: { icon: IconName; label: string | undefined; clearLabel: string; onClear: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onClear}
      accessibilityRole="button"
      accessibilityLabel={clearLabel}
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
      <Icon name={icon} size={15} color={t.c.primary} />
      {label ? (
        <Text variant="caption" weight="600" tone="primary" numberOfLines={1} style={{ maxWidth: 220 }}>
          {label}
        </Text>
      ) : (
        <Skeleton height={10} width={110} radius={4} />
      )}
      <Icon name="close" size={15} color={t.c.primary} />
    </Pressable>
  );
}

/** A list opened for one contact (`?party=…`, from their page's "See all"). Nothing when no party is set. */
export function PartyFilterChip({ partyId, supplier, onClear }: { partyId: string | null | undefined; supplier?: boolean; onClear: () => void }) {
  const { t: tr } = useTranslation(['common']);
  const party = usePartyRecord(partyId ?? undefined).data;
  if (!partyId) return null;
  return (
    <FilterChip
      icon={supplier ? 'truck-outline' : 'account-outline'}
      label={party ? tr(supplier ? 'common:documentList.supplierFilter' : 'common:documentList.customerFilter', { name: party.name }) : undefined}
      clearLabel={tr('common:documentList.clearPartyNamed', { name: party?.name ?? '' })}
      onClear={onClear}
    />
  );
}

/** A list opened for one item (`?item=…`, from its page's "See all"). Nothing when no item is set. */
export function ItemFilterChip({ itemId, onClear }: { itemId: string | null | undefined; onClear: () => void }) {
  const { t: tr } = useTranslation(['inventory']);
  const item = useItemRecord(itemId ?? undefined).data;
  if (!itemId) return null;
  return (
    <FilterChip
      icon="package-variant"
      label={item ? tr('inventory:movements.itemFilter', { name: item.name }) : undefined}
      clearLabel={tr('inventory:movements.clearItem', { name: item?.name ?? '' })}
      onClear={onClear}
    />
  );
}
