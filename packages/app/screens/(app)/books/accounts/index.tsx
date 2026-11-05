import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Card } from '@esmart/ui/components/Card';
import { Button } from '@esmart/ui/components/Button';
import { PrimaryActionBar } from '@esmart/ui/components/ActionBar';
import { ListRow } from '@esmart/ui/components/ListRow';
import { SearchBar } from '@esmart/ui/components/SearchBar';
import { Sheet } from '@esmart/ui/components/Sheet';
import { AmountField, PickerField, Segmented, SwitchField, TextField } from '@esmart/ui/components/Field';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { Icon } from '@esmart/ui/components/Icon';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { useToast } from '@esmart/ui/components/Toast';
import { Text } from '@esmart/ui/components/Text';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { GROUPS, USER_GROUPS, chartOfAccounts } from '@esmart/core/domain/ledger/accounts';
import { fromMajor, toMajor } from '@esmart/core/lib/money';
import { uid } from '@esmart/core/lib/id';
import { nowISO, today } from '@esmart/core/lib/date';
import type { LedgerAccount, LedgerGroup } from '@esmart/core/types';
import { useServerSave } from '../../../../components/useServerSave';
import { useAppStore } from '../../../../store/appStore';
import { useLedgerAccounts } from '../../../../store/books';
import { useServerBook } from '../../../../remote/queries';
import { useActiveCompany, useBaseCurrency } from '../../../../store/selectors';
import { useAccountName, useDrCr, useGroupName } from '../../../../features/books/names';

const ORDER = Object.keys(GROUPS) as LedgerGroup[];

/** Every account, grouped, with its balance today; add an account of your own. */
export default function ChartOfAccounts() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { t: tr } = useTranslation(['books', 'common']);
  const { run: serverSave, saving, blocked } = useServerSave();
  const company = useActiveCompany();
  const baseCurrency = useBaseCurrency();
  const { book, balances: serverBalances } = useServerBook();
  const ledgerAccounts = useLedgerAccounts();
  const saveLedgerAccount = useAppStore((s) => s.saveLedgerAccount);
  const nameOf = useAccountName();
  const groupName = useGroupName();
  const drCr = useDrCr();

  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<LedgerAccount | null>(null);
  const [name, setName] = useState('');
  const [group, setGroup] = useState<LedgerGroup>('indirectExpenses');
  const [opening, setOpening] = useState('');
  const [side, setSide] = useState<'dr' | 'cr'>('dr');
  const [openingDate, setOpeningDate] = useState<string | undefined>();
  const [groupOpen, setGroupOpen] = useState(false);

  // Every account's balance today, worked out by the server from the whole book.
  const balances = useMemo(() => new Map(Object.entries(serverBalances)), [serverBalances]);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const accounts = chartOfAccounts(book).filter((a) => a.key !== 'sys:openingStock' && (!q || nameOf(a).toLowerCase().includes(q)));
    // TDS payable per section exists only once something was kept back under it.
    const dynamic = [...balances.keys()].filter((k) => k.startsWith('sys:tdsPayable:')).map((key) => ({ key, name: key, group: 'dutiesTaxes' as LedgerGroup, kind: 'system' as const }));
    const all = [...accounts, ...dynamic.filter((d) => !q || nameOf(d).toLowerCase().includes(q))];
    // Unused system accounts stay out of the way.
    const shown = all.filter((a) => a.kind !== 'system' || balances.get(a.key) || q);
    return ORDER.map((g) => ({ group: g, accounts: shown.filter((a) => a.group === g).sort((a, b) => nameOf(a).localeCompare(nameOf(b))) })).filter((s) => s.accounts.length);
  }, [book, balances, query, nameOf]);

  const open = (a?: LedgerAccount) => {
    setEditing(a ?? ({ id: '', companyId: company.id, name: '', group: 'indirectExpenses', openingBalance: fromMajor('0', baseCurrency), status: 'active', createdAt: nowISO() } as LedgerAccount));
    setName(a?.name ?? '');
    setGroup(a?.group ?? 'indirectExpenses');
    setOpening(a && a.openingBalance.minor ? String(Math.abs(toMajor(a.openingBalance))) : '');
    setSide(a && a.openingBalance.minor < 0 ? 'cr' : 'dr');
    setOpeningDate(a?.openingBalanceDate);
  };

  const save = async () => {
    if (!editing || !name.trim()) return;
    const amount = fromMajor(opening || '0', baseCurrency);
    const record: LedgerAccount = {
      ...editing,
      id: editing.id || uid('lac'),
      name: name.trim(),
      group,
      openingBalance: side === 'cr' ? { ...amount, minor: -amount.minor } : amount,
      openingBalanceDate: amount.minor ? openingDate : undefined,
    };
    const res = await serverSave(() => saveLedgerAccount(record), tr('books:accounts.saved'), { icon: 'format-list-bulleted-type' });
    if (res) setEditing(null);
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('books:hub.accounts') }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 + insets.bottom, gap: t.spacing.md }} showsVerticalScrollIndicator={SHOW_SCROLLBAR} keyboardShouldPersistTaps="handled">
        <SearchBar value={query} onChangeText={setQuery} placeholder={tr('books:accounts.search')} />
        {sections.map((s) => (
          <View key={s.group} style={{ gap: t.spacing.sm }}>
            <Text variant="caption" tone="muted" weight="700" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
              {groupName(s.group)}
            </Text>
            <Card padded={false}>
              {s.accounts.map((a, i) => {
                const own = a.kind === 'custom' ? ledgerAccounts.find((x) => x.id === a.refId) : undefined;
                return (
                  <ListRow
                    key={a.key}
                    title={nameOf(a)}
                    subtitle={own ? (own.status === 'inactive' ? tr('books:accounts.inactive') : tr('books:accounts.yours')) : undefined}
                    right={
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
                        <Text variant="small" weight="600" style={{ fontVariant: ['tabular-nums'] }}>
                          {drCr(balances.get(a.key) ?? 0, baseCurrency)}
                        </Text>
                        {own ? (
                          <Pressable onPress={() => open(own)} accessibilityRole="button" accessibilityLabel={tr('books:accounts.edit')} hitSlop={8}>
                            <Icon name="pencil-outline" size={18} color={t.c.muted} />
                          </Pressable>
                        ) : null}
                      </View>
                    }
                    onPress={() => router.push(`/(app)/books/accounts/${encodeURIComponent(a.key)}` as never)}
                    onLongPress={own ? () => open(own) : undefined}
                    chevron
                    divider={i < s.accounts.length - 1}
                  />
                );
              })}
            </Card>
          </View>
        ))}
      </ScrollView>

      <PrimaryActionBar title={tr('books:accounts.add')} icon="plus" onPress={() => open()} />

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? tr('books:accounts.edit') : tr('books:accounts.add')}
        footer={<Button title={tr('books:accounts.save')} onPress={() => void save()} loading={saving} disabled={blocked || !name.trim()} />}
      >
        <View style={{ padding: t.spacing.lg, gap: t.spacing.lg }}>
          <TextField label={tr('books:accounts.name')} value={name} onChangeText={setName} placeholder={tr('books:accounts.namePlaceholder')} required />
          <PickerField label={tr('books:accounts.group')} value={groupName(group)} onPress={() => setGroupOpen(true)} icon="folder-outline" />
          <View style={{ gap: t.spacing.sm }}>
            <AmountField label={tr('books:accounts.opening')} value={opening} onChangeValue={setOpening} currency={baseCurrency} hint={tr('books:accounts.openingHint')} />
            <Segmented
              size="sm"
              options={[
                { value: 'dr', label: tr('books:accounts.debitSide') },
                { value: 'cr', label: tr('books:accounts.creditSide') },
              ]}
              value={side}
              onChange={setSide}
            />
          </View>
          <SwitchField label={tr('books:accounts.openingOnDate')} description={tr('books:accounts.openingOnDateHint')} value={!!openingDate} onValueChange={(on) => setOpeningDate(on ? today() : undefined)} />
          {openingDate ? <DateField label={tr('books:accounts.openingDate')} value={openingDate} onChange={setOpeningDate} maximumDate={new Date()} /> : null}
        </View>
      </Sheet>
      <SelectSheet
        visible={groupOpen}
        onClose={() => setGroupOpen(false)}
        title={tr('books:accounts.group')}
        options={USER_GROUPS.map((g) => ({ value: g, label: groupName(g) }))}
        value={group}
        onSelect={(g) => setGroup(g as LedgerGroup)}
      />
    </View>
  );
}
