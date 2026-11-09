import React, { useState } from 'react';
import { Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Icon } from '@esmart/ui/components/Icon';
import { Text } from '@esmart/ui/components/Text';
import { FilterMenu } from '@esmart/ui/components/FilterMenu';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { useBranches, useSwitcherBranchId } from '../store/selectors';
import type { QueryParams } from '../navigation/queryParams';

/** `?branch=all` widens a list to every branch the user works in. */
export const ALL_BRANCHES = 'all';

export type ListBranch = {
  /** Whether to offer the filter at all: only with more than one branch to choose from. */
  shown: boolean;
  /** The branch the list asks the server for; undefined for every branch the user can see. */
  branchId: string | undefined;
  /** The user picked something other than the default on this screen (kept in the URL). */
  overridden: boolean;
  /** What `?branch=` should hold for a pick: undefined when it is the default again. */
  paramFor: (value: string) => string | undefined;
  branches: { id: string; name: string; code?: string }[];
  name: string | undefined;
};

/**
 * A list's branch, as the hubs count it: by default the branch picked in the top bar (and it
 * follows the top bar when that changes), unless the user chose another option on this screen,
 * which the URL keeps as `?branch=<id>` or `?branch=all`. A branch the user no longer sees falls
 * back to the default.
 */
export function useListBranch(params: QueryParams): ListBranch {
  const branches = useBranches();
  const fallback = useSwitcherBranchId();
  const raw = params.branch;
  const overridden = raw === ALL_BRANCHES || (!!raw && branches.some((b) => b.id === raw));
  const branchId = overridden ? (raw === ALL_BRANCHES ? undefined : raw) : fallback;
  const defaultValue = fallback ?? ALL_BRANCHES;
  return {
    shown: branches.length > 1,
    branchId,
    overridden,
    paramFor: (value) => (value === defaultValue ? undefined : value),
    branches,
    name: branches.find((b) => b.id === branchId)?.name,
  };
}

/** The chosen branch as a chip; pressing it shows every branch (like the party chip). Nothing when it isn't narrowing. */
export function BranchChip({ branch, onClear }: { branch: ListBranch; onClear: () => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  if (!branch.shown || !branch.branchId) return null;
  return (
    <Pressable
      onPress={onClear}
      accessibilityRole="button"
      accessibilityLabel={tr('common:documentList.clearBranchNamed', { name: branch.name ?? '' })}
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
      <Icon name="office-building-outline" size={15} color={t.c.primary} />
      <Text variant="caption" weight="600" tone="primary" numberOfLines={1} style={{ maxWidth: 220 }}>
        {tr('common:documentList.branchFilter', { name: branch.name ?? '…' })}
      </Text>
      <Icon name="close" size={15} color={t.c.primary} />
    </Pressable>
  );
}

/** The options a branch filter offers: every branch, then each one. */
export function branchOptions(branch: ListBranch, allLabel: string) {
  return [{ value: ALL_BRANCHES, label: allLabel }, ...branch.branches.map((b) => ({ value: b.id, label: b.name }))];
}

/** The desktop toolbar's branch control. */
export function BranchFilterMenu({ branch, onChange }: { branch: ListBranch; onChange: (value: string) => void }) {
  const { t: tr } = useTranslation(['common']);
  if (!branch.shown) return null;
  return (
    <FilterMenu
      icon="office-building-outline"
      label={tr('common:filters.branch')}
      value={branch.branchId ?? ALL_BRANCHES}
      neutralValue={ALL_BRANCHES}
      options={branchOptions(branch, tr('common:component.allBranches'))}
      onChange={onChange}
    />
  );
}

/**
 * A phone list without a filter sheet: a chip naming the branch shown (or all branches) that
 * opens a picker of every branch.
 */
export function BranchPickerChip({ branch, onChange }: { branch: ListBranch; onChange: (value: string) => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  const [open, setOpen] = useState(false);
  if (!branch.shown) return null;
  const narrowed = !!branch.branchId;
  const label = narrowed ? tr('common:documentList.branchFilter', { name: branch.name ?? '…' }) : tr('common:component.allBranches');
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${tr('common:filters.branch')}: ${narrowed ? (branch.name ?? '') : tr('common:component.allBranches')}`}
        hitSlop={{ top: 4, bottom: 4 }}
        style={{
          height: 36,
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: 6,
          paddingHorizontal: t.spacing.md,
          borderRadius: t.radius.pill,
          backgroundColor: narrowed ? t.c.chip : t.c.paper,
          borderWidth: 1,
          borderColor: narrowed ? t.c.primary : t.c.line,
        }}
      >
        <Icon name="office-building-outline" size={15} color={narrowed ? t.c.primary : t.c.muted} />
        <Text variant="caption" weight="600" tone={narrowed ? 'primary' : 'muted'} numberOfLines={1} style={{ maxWidth: 220 }}>
          {label}
        </Text>
        <Icon name="chevron-down" size={15} color={narrowed ? t.c.primary : t.c.muted} />
      </Pressable>
      <SelectSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={tr('common:filters.branch')}
        options={[
          { value: ALL_BRANCHES, label: tr('common:component.allBranches') },
          ...branch.branches.map((b) => ({ value: b.id, label: b.name, description: b.code })),
        ]}
        value={branch.branchId ?? ALL_BRANCHES}
        onSelect={onChange}
        searchable={false}
      />
    </>
  );
}
