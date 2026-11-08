import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Card } from '@esmart/ui/components/Card';
import { Button } from '@esmart/ui/components/Button';
import { PrimaryActionBar } from '@esmart/ui/components/ActionBar';
import { SearchBar } from '@esmart/ui/components/SearchBar';
import { Sheet } from '@esmart/ui/components/Sheet';
import { AmountField, PickerField, Segmented, SwitchField, TextField } from '@esmart/ui/components/Field';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { Icon } from '@esmart/ui/components/Icon';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { Text } from '@esmart/ui/components/Text';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { USER_GROUPS, chartOfAccounts, groupTree, type AccountFigures, type TreeAccount } from '@esmart/core/domain/ledger/accounts';
import type { trialBalance } from '@esmart/core/domain/ledger/reports';
import { formatMoney } from '@esmart/core/lib/format';
import { fromMajor, money, toMajor } from '@esmart/core/lib/money';
import { uid } from '@esmart/core/lib/id';
import { nowISO, today } from '@esmart/core/lib/date';
import type { LedgerAccount, LedgerGroup } from '@esmart/core/types';
import { useServerSave } from '../../../../components/useServerSave';
import { useAppStore } from '../../../../store/appStore';
import { useLedgerAccounts } from '../../../../store/books';
import { useBooksView, useServerBook } from '../../../../remote/queries';
import { ReportShell, reportTable, useReportScope } from '../../../../features/reports/ReportShell';
import { useActiveCompany, useBaseCurrency } from '../../../../store/selectors';
import { useAccountName, useDrCr, useGroupName } from '../../../../features/books/names';
import { Skeleton, SkeletonGroup } from '@esmart/ui/components/Skeleton';

type Figures = AccountFigures;
const NO_FIGURES: Figures = { opening: 0, debit: 0, credit: 0, closing: 0 };
const COL = 128;

/**
 * The chart of accounts as a tree — Assets, Liabilities, Income, Expenses → group → sub-group →
 * account — with each level's opening, debits, credits and closing for a period, as the trial
 * balance has them (so its totals tie). Add an account of your own; tap one for its ledger.
 */
export default function ChartOfAccounts() {
  const t = useTheme();
  const router = useRouter();
  const { t: tr } = useTranslation(['books', 'common']);
  const { run: serverSave, saving, blocked } = useServerSave();
  const company = useActiveCompany();
  const baseCurrency = useBaseCurrency();
  const desktop = useIsDesktop();
  const { book, balances: serverBalances } = useServerBook();
  const ledgerAccounts = useLedgerAccounts();
  const saveLedgerAccount = useAppStore((s) => s.saveLedgerAccount);
  const nameOf = useAccountName();
  const groupName = useGroupName();
  const drCr = useDrCr();
  const { scope, setScope } = useReportScope('thisFY');
  const tbQuery = useBooksView<ReturnType<typeof trialBalance>>('trial-balance', scope.filters.range);
  const tb = tbQuery.data;

  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<LedgerAccount | null>(null);
  const [name, setName] = useState('');
  const [group, setGroup] = useState<LedgerGroup>('indirectExpenses');
  const [opening, setOpening] = useState('');
  const [side, setSide] = useState<'dr' | 'cr'>('dr');
  const [openingDate, setOpeningDate] = useState<string | undefined>();
  const [groupOpen, setGroupOpen] = useState(false);

  const tree = useMemo(() => {
    const q = query.trim().toLowerCase();
    const moved = new Map((tb?.rows ?? []).map((r) => [r.account.key, r]));
    const accounts = chartOfAccounts(book).filter((a) => a.key !== 'sys:openingStock');
    const known = new Set(accounts.map((a) => a.key));
    // Accounts that exist only once something posts to them (TDS or TCS payable per section).
    const dynamic = (tb?.rows ?? []).filter((r) => !known.has(r.account.key)).map((r) => r.account);
    const rows: TreeAccount[] = [...accounts, ...dynamic]
      // Unused system accounts stay out of the way.
      .filter((a) => a.kind !== 'system' || moved.has(a.key) || serverBalances[a.key] || q)
      .filter((a) => !q || nameOf(a).toLowerCase().includes(q))
      .map((a) => {
        const r = moved.get(a.key);
        return { account: a, ...(r ? { opening: r.opening, debit: r.debit, credit: r.credit, closing: r.closing } : NO_FIGURES) };
      });
    return groupTree(rows, nameOf);
  }, [book, tb, serverBalances, query, nameOf]);

  const nodeIds = useMemo(
    () => tree.natures.flatMap((n) => [`n:${n.nature}`, ...n.headings.flatMap((h) => [`h:${h.group}`, ...h.subGroups.map((g) => `g:${g.group}`)])]),
    [tree],
  );
  // A search opens every branch, so what matches is in view.
  const isOpen = (id: string) => !!query.trim() || !collapsed.has(id);
  const toggle = (id: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(nodeIds));

  const m = (minor: number) => (minor ? formatMoney(money(minor, baseCurrency)) : '—');
  const dc = (minor: number) => (minor ? drCr(minor, baseCurrency) : '—');

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

  const ownOf = (a: TreeAccount) => (a.account.kind === 'custom' ? ledgerAccounts.find((x) => x.id === a.account.refId) : undefined);
  const openLedger = (key: string) => router.push(`/(app)/books/accounts/${encodeURIComponent(key)}` as never);

  /** A desktop row: the name (indented by its depth), then the four figures. */
  const tableRow = (o: {
    key: string;
    depth: number;
    label: string;
    f: Figures;
    strong?: boolean;
    open?: boolean;
    onPress?: () => void;
    onLongPress?: () => void;
    subtitle?: string;
    trailing?: React.ReactNode;
    isGroup?: boolean;
  }) => (
    <Pressable
      key={o.key}
      onPress={o.onPress}
      onLongPress={o.onLongPress}
      accessibilityRole="button"
      accessibilityState={o.isGroup ? { expanded: o.open } : undefined}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: o.depth === 0 ? t.spacing.md : t.spacing.sm,
        paddingHorizontal: t.spacing.lg,
        borderBottomWidth: 0.5,
        borderBottomColor: t.c.line,
        backgroundColor: pressed || hovered ? t.c.card2 : o.depth === 0 ? t.c.chip : 'transparent',
      })}
    >
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, paddingLeft: o.depth * 18 }}>
        {o.isGroup ? <Icon name={o.open ? 'chevron-down' : 'chevron-right'} size={16} color={t.c.muted} /> : <View style={{ width: 16 }} />}
        <View style={{ flex: 1 }}>
          <Text variant="small" weight={o.strong ? '700' : '500'} numberOfLines={1}>
            {o.label}
          </Text>
          {o.subtitle ? (
            <Text variant="micro" tone="muted" numberOfLines={1}>
              {o.subtitle}
            </Text>
          ) : null}
        </View>
        {o.trailing}
      </View>
      {[dc(o.f.opening), m(o.f.debit), m(o.f.credit), dc(o.f.closing)].map((v, i) => (
        <Text key={i} variant="small" weight={o.strong ? '700' : '400'} tone={v === '—' ? 'muted' : undefined} style={{ width: COL, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
          {v}
        </Text>
      ))}
    </Pressable>
  );

  /** A phone row: the closing balance; a group, opened, shows its opening, debits and credits too. */
  const phoneRow = (o: {
    key: string;
    depth: number;
    label: string;
    f: Figures;
    strong?: boolean;
    open?: boolean;
    onPress?: () => void;
    onLongPress?: () => void;
    subtitle?: string;
    trailing?: React.ReactNode;
    isGroup?: boolean;
  }) => (
    <Pressable
      key={o.key}
      onPress={o.onPress}
      onLongPress={o.onLongPress}
      accessibilityRole="button"
      accessibilityState={o.isGroup ? { expanded: o.open } : undefined}
      style={({ pressed }) => ({
        paddingVertical: t.spacing.md,
        paddingHorizontal: t.spacing.lg,
        paddingLeft: t.spacing.lg + o.depth * 14,
        borderBottomWidth: 0.5,
        borderBottomColor: t.c.line,
        backgroundColor: pressed ? t.c.card2 : o.depth === 0 ? t.c.chip : 'transparent',
        gap: 2,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
        {o.isGroup ? <Icon name={o.open ? 'chevron-down' : 'chevron-right'} size={16} color={t.c.muted} /> : null}
        <Text variant="small" weight={o.strong ? '700' : '500'} numberOfLines={1} style={{ flex: 1 }}>
          {o.label}
        </Text>
        <Text variant="small" weight={o.strong ? '700' : '600'} style={{ fontVariant: ['tabular-nums'] }}>
          {drCr(o.f.closing, baseCurrency)}
        </Text>
        {o.trailing}
        {o.isGroup ? null : <Icon name="chevron-right" size={16} color={t.c.muted} />}
      </View>
      {o.subtitle ? (
        <Text variant="micro" tone="muted" numberOfLines={1} style={{ paddingLeft: o.isGroup ? 24 : 0 }}>
          {o.subtitle}
        </Text>
      ) : null}
      {o.isGroup && o.open ? (
        <Text variant="micro" tone="muted" numberOfLines={1} style={{ paddingLeft: 24, fontVariant: ['tabular-nums'] }}>
          {`${tr('books:tb.opening')} ${dc(o.f.opening)} · ${tr('books:tb.debit')} ${m(o.f.debit)} · ${tr('books:tb.credit')} ${m(o.f.credit)}`}
        </Text>
      ) : null}
    </Pressable>
  );
  const row = desktop ? tableRow : phoneRow;

  const accountRow = (a: TreeAccount, depth: number) => {
    const own = ownOf(a);
    return row({
      key: a.account.key,
      depth,
      label: nameOf(a.account),
      f: a,
      onPress: () => openLedger(a.account.key),
      onLongPress: own ? () => open(own) : undefined,
      subtitle: [
        own ? (own.status === 'inactive' ? tr('books:accounts.inactive') : tr('books:accounts.yours')) : '',
        // A phone shows an account's movement under its name; a desktop has the columns.
        !desktop && (a.debit || a.credit) ? `${tr('books:tb.debit')} ${m(a.debit)} · ${tr('books:tb.credit')} ${m(a.credit)}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
      trailing: own ? (
        <Pressable onPress={() => open(own)} accessibilityRole="button" accessibilityLabel={tr('books:accounts.edit')} hitSlop={8}>
          <Icon name="pencil-outline" size={18} color={t.c.muted} />
        </Pressable>
      ) : undefined,
    });
  };

  const exportRows = () =>
    reportTable(
      [tr('books:tb.account'), tr('books:accounts.group'), tr('books:tb.opening'), tr('books:tb.debit'), tr('books:tb.credit'), tr('books:tb.closing')],
      tree.natures.flatMap((n) =>
        n.headings.flatMap((h) =>
          [...h.accounts.map((a) => ({ a, g: h.group })), ...h.subGroups.flatMap((g) => g.accounts.map((a) => ({ a, g: g.group })))].map(({ a, g }) => [
            nameOf(a.account),
            groupName(g),
            a.opening / 100,
            a.debit / 100,
            a.credit / 100,
            a.closing / 100,
          ]),
        ),
      ),
    );

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('books:hub.accounts') }} />
      <ReportShell
        title={tr('books:hub.accounts')}
        subtitle={tr('books:tb.basis')}
        scope={scope}
        onScopeChange={setScope}
        // A phone keeps its bottom bar for adding an account.
        exportRows={desktop ? exportRows : undefined}
        generatedAt={tbQuery.dataUpdatedAt}
      >
        <View style={{ gap: t.spacing.md }}>
          <View style={{ flexDirection: desktop ? 'row' : 'column', gap: t.spacing.sm, alignItems: desktop ? 'center' : 'stretch' }}>
            <View style={{ flex: desktop ? 1 : undefined }}>
              <SearchBar value={query} onChangeText={setQuery} placeholder={tr('books:accounts.search')} />
            </View>
            <View style={{ flexDirection: 'row', gap: t.spacing.sm, flexWrap: 'wrap' }}>
              <Button title={tr('books:accounts.expandAll')} icon="unfold-more-horizontal" variant="ghost" size="sm" onPress={expandAll} />
              <Button title={tr('books:accounts.collapseAll')} icon="unfold-less-horizontal" variant="ghost" size="sm" onPress={collapseAll} />
              {desktop ? <Button title={tr('books:accounts.add')} icon="plus" size="sm" onPress={() => open()} /> : null}
            </View>
          </View>

          {/* The chart is here already; a thin shimmer while its balances arrive. */}
          {!tb && tbQuery.isLoading ? (
            <SkeletonGroup>
              <Skeleton height={4} radius={2} />
            </SkeletonGroup>
          ) : null}

          <Card padded={false} style={{ overflow: 'hidden' }}>
            {desktop ? (
              <View style={{ flexDirection: 'row', paddingVertical: t.spacing.sm, paddingHorizontal: t.spacing.lg, borderBottomWidth: 1, borderBottomColor: t.c.line }}>
                <Text variant="caption" tone="muted" weight="700" style={{ flex: 1, paddingLeft: 24 }}>
                  {tr('books:tb.account')}
                </Text>
                {[tr('books:tb.opening'), tr('books:tb.debit'), tr('books:tb.credit'), tr('books:tb.closing')].map((h) => (
                  <Text key={h} variant="caption" tone="muted" weight="700" style={{ width: COL, textAlign: 'right' }}>
                    {h}
                  </Text>
                ))}
              </View>
            ) : null}
            {tree.natures.map((n) => {
              const nId = `n:${n.nature}`;
              return (
                <React.Fragment key={nId}>
                  {row({ key: nId, depth: 0, label: tr(`books:accounts.nature.${n.nature}`), f: n.totals, strong: true, isGroup: true, open: isOpen(nId), onPress: () => toggle(nId) })}
                  {isOpen(nId)
                    ? n.headings.map((h) => {
                        const hId = `h:${h.group}`;
                        return (
                          <React.Fragment key={hId}>
                            {row({ key: hId, depth: 1, label: groupName(h.group), f: h.totals, strong: true, isGroup: true, open: isOpen(hId), onPress: () => toggle(hId) })}
                            {isOpen(hId) ? (
                              <>
                                {h.subGroups.map((g) => {
                                  const gId = `g:${g.group}`;
                                  return (
                                    <React.Fragment key={gId}>
                                      {row({ key: gId, depth: 2, label: groupName(g.group), f: g.totals, strong: true, isGroup: true, open: isOpen(gId), onPress: () => toggle(gId) })}
                                      {isOpen(gId) ? g.accounts.map((a) => accountRow(a, 3)) : null}
                                    </React.Fragment>
                                  );
                                })}
                                {h.accounts.map((a) => accountRow(a, 2))}
                              </>
                            ) : null}
                          </React.Fragment>
                        );
                      })
                    : null}
                </React.Fragment>
              );
            })}
            {tree.natures.length ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: t.spacing.md, paddingHorizontal: t.spacing.lg, gap: t.spacing.sm }}>
                <Text variant="small" weight="700" style={{ flex: 1, paddingLeft: desktop ? 24 : 0 }}>
                  {tr('books:tb.total')}
                </Text>
                {desktop ? (
                  <>
                    <View style={{ width: COL }} />
                    <Text variant="small" weight="700" style={{ width: COL, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{m(tree.totals.debit)}</Text>
                    <Text variant="small" weight="700" style={{ width: COL, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{m(tree.totals.credit)}</Text>
                    <Text variant="small" weight="700" tone={tree.totals.closingDebit === tree.totals.closingCredit ? 'good' : 'bad'} style={{ width: COL, textAlign: 'right' }}>
                      {tree.totals.closingDebit === tree.totals.closingCredit ? '✓' : '!'}
                    </Text>
                  </>
                ) : (
                  <Text variant="caption" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
                    {`${tr('books:tb.debit')} ${m(tree.totals.debit)} · ${tr('books:tb.credit')} ${m(tree.totals.credit)}`}
                  </Text>
                )}
              </View>
            ) : null}
          </Card>
        </View>
      </ReportShell>

      {desktop ? null : <PrimaryActionBar title={tr('books:accounts.add')} icon="plus" onPress={() => open()} />}

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
