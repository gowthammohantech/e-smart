import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SelectSheet, type SelectOption } from '@esmart/ui/components/pickers/SelectSheet';
import { chartOfAccounts } from '@esmart/core/domain/ledger/accounts';
import { VOUCHER_ROLES, receiptSourceRule } from '@esmart/core/domain/ledger/voucherRules';
import type { LedgerGroup } from '@esmart/core/types';
import { usePartySearch, useServerBook } from '../../remote/queries';
import { useDebounced } from '../../components/useDebounced';
import { useAppStore } from '../../store/appStore';
import { useCurrentUser, useHasModule } from '../../store/selectors';
import { useAccountName, useGroupName } from '../books/names';

const CASH: LedgerGroup[] = ['cashInHand', 'bankAccounts'];
const INCOME: LedgerGroup[] = ['indirectIncomes', 'directIncomes'];
const CUSTOMER = 'customer:';

/** What a receipt is for: an account it credits (an income, a loan, a supplier's ledger), or a customer whose invoices it settles. */
export type ReceivedFor = { kind: 'account'; key: string; label?: string } | { kind: 'customer'; partyId: string };

/** What the person typed, carried across when the receipt turns from a voucher into a customer payment or back. */
export type ReceiptCarry = { amount?: string; date?: string; reference?: string; notes?: string };

type Tab = 'all' | 'income' | 'customers' | 'suppliers' | 'other';

/** The sheet's value for a customer, as against an account key. */
export const customerValue = (partyId: string) => `${CUSTOMER}${partyId}`;

type Found = { id?: string; name?: string; kind?: string; phone?: string; code?: string };
const found = (rows: Found[] | undefined) => (rows ?? []).filter((p) => p.id && p.name);

/**
 * "Received for", under All · Income · Customers · Suppliers · Other accounts, All being the other
 * four together. A customer is money against their invoices (a payment received); an income, a
 * supplier or another account is a receipt voucher crediting it. It offers only what will save for
 * the person (receiptSourceRule, as the server checks it): no account the books keep themselves, a
 * supplier's ledger or a control account only for an owner or admin, nothing inactive. Without the
 * books (Free, Basic), or for someone who can't record vouchers, it is customers alone. `customers`
 * off (editing a saved receipt voucher, which stays a voucher) leaves them out.
 */
export function ReceivedForSheet({
  visible,
  onClose,
  value,
  onPick,
  onCreateIncome,
  customers = true,
}: {
  visible: boolean;
  onClose: () => void;
  /** An account key, or `customerValue(id)`. */
  value?: string;
  onPick: (picked: ReceivedFor) => void;
  onCreateIncome?: (name: string) => void;
  customers?: boolean;
}) {
  const { t: tr } = useTranslation(['books']);
  const books = useHasModule('books');
  const role = useCurrentUser()?.role;
  // A receipt voucher needs the books and a role that records vouchers; otherwise only customers' payments remain.
  const vouchers = books && VOUCHER_ROLES.includes(role ?? '');
  // Money into cash from a supplier's ledger is an owner's or admin's call (it skips their bills).
  const suppliers = vouchers && receiptSourceRule('party:', role) !== 'refused';
  const { book } = useServerBook();
  const ledgerAccounts = useAppStore((s) => s.ledgerAccounts);
  const nameOf = useAccountName();
  const groupName = useGroupName();
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const q = useDebounced(query);

  const tabs = vouchers
    ? ([
        { key: 'all', label: tr('books:receipts.tabAll') },
        { key: 'income', label: tr('books:receipts.tabIncome') },
        ...(customers ? [{ key: 'customers', label: tr('books:receipts.tabCustomers') }] : []),
        ...(suppliers ? [{ key: 'suppliers', label: tr('books:receipts.tabSuppliers') }] : []),
        { key: 'other', label: tr('books:receipts.tabOther') },
      ] as { key: Tab; label: string }[])
    : undefined;
  // Without vouchers there is nothing but customers; a tab not offered falls back to All.
  const shown: Tab = !vouchers ? 'customers' : tabs!.some((x) => x.key === tab) ? tab : 'all';
  const wantCustomers = customers && (shown === 'customers' || shown === 'all');
  const wantSuppliers = suppliers && (shown === 'suppliers' || shown === 'all');
  const customerSearch = usePartySearch('customer', q, visible && wantCustomers);
  // An inactive contact takes no new entries.
  const supplierSearch = usePartySearch('supplier', q, visible && wantSuppliers, 'active');

  // The chart's own accounts that a receipt can credit: not cash or bank (where the money goes), not
  // contacts (searched on the server), not what the server refuses for this person, not inactive.
  const accounts = useMemo(() => {
    const inactive = new Set(ledgerAccounts.filter((a) => a.status === 'inactive').map((a) => `acc:${a.id}`));
    const usable = chartOfAccounts(book).filter((a) => !CASH.includes(a.group) && !a.key.startsWith('party:') && !inactive.has(a.key) && receiptSourceRule(a.key, role) !== 'refused');
    const typed = q.trim().toLowerCase();
    return typed ? usable.filter((a) => nameOf(a).toLowerCase().includes(typed) || groupName(a.group).toLowerCase().includes(typed)) : usable;
  }, [book, ledgerAccounts, role, q, nameOf, groupName]);
  const accountOption = (a: (typeof accounts)[number]): SelectOption => ({ value: a.key, label: nameOf(a), description: groupName(a.group) });
  const income = accounts.filter((a) => INCOME.includes(a.group)).map(accountOption);
  const other = accounts.filter((a) => !INCOME.includes(a.group)).map(accountOption);

  const contact = (p: Found, as: 'customer' | 'supplier'): SelectOption => ({
    value: as === 'customer' ? customerValue(p.id!) : `party:${p.id}`,
    label: p.name ?? '',
    description: [tr(as === 'customer' ? 'books:receipts.kindCustomer' : 'books:receipts.kindSupplier'), p.phone ?? p.code].filter(Boolean).join(' · '),
  });
  const customerRows = wantCustomers ? found(customerSearch.data as Found[]) : [];
  const customerOptions = customerRows.map((p) => contact(p, 'customer'));
  const supplierRows = wantSuppliers ? found(supplierSearch.data as Found[]) : [];
  // A contact who is both shows under Customers and under Suppliers, but once under All: as a customer, whose invoices it settles.
  const asCustomer = new Set(customerRows.map((p) => p.id));
  const supplierOptions = supplierRows.filter((p) => shown !== 'all' || !asCustomer.has(p.id)).map((p) => contact(p, 'supplier'));

  const options: SelectOption[] =
    shown === 'income'
      ? income
      : shown === 'customers'
        ? customerOptions
        : shown === 'suppliers'
          ? supplierOptions
          : shown === 'other'
            ? other
            : [...income, ...customerOptions, ...supplierOptions, ...other];
  const loading = (wantCustomers && customerSearch.isFetching) || (wantSuppliers && supplierSearch.isFetching);
  const canCreate = vouchers && !!onCreateIncome && (shown === 'all' || shown === 'income');

  return (
    <SelectSheet
      visible={visible}
      onClose={() => {
        setQuery('');
        onClose();
      }}
      title={tr(vouchers ? 'books:receipts.pickSource' : 'books:receipts.pickCustomer')}
      options={options}
      value={value}
      onQueryChange={setQuery}
      loading={loading}
      tabs={tabs}
      tab={shown}
      onTabChange={(k) => setTab(k as Tab)}
      onSelect={(v) => {
        if (v.startsWith(CUSTOMER)) onPick({ kind: 'customer', partyId: v.slice(CUSTOMER.length) });
        else onPick({ kind: 'account', key: v, label: options.find((o) => o.value === v)?.label });
      }}
      onCreate={canCreate ? (name) => onCreateIncome?.(name) : undefined}
      createLabel={(name) => tr('books:receipts.newIncome', { name })}
    />
  );
}
