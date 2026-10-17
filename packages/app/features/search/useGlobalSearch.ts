import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  useDocuments,
  useExpenses,
  useItems,
  useParties,
  usePayments,
  useStockLevels,
  useCanOpen,
} from '../../store/selectors';
import { documentKindLabel } from '@esmart/core/labels';
import { detailRouteFor } from '../documents/DocumentEditor';
import { formatMoney, formatQty } from '@esmart/core/lib/format';
import { formatDate } from '@esmart/core/lib/date';

export type SearchResult = {
  id: string;
  group: string;
  title: string;
  subtitle: string;
  trailing?: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  route: string;
};

/**
 * Every record the active company owns that matches `query` (two characters
 * or more), grouped for display. Shared by the search screen and the desktop
 * command palette.
 */
export function useGlobalSearch(query: string) {
  const { t: tr } = useTranslation(['common', 'domain', 'nav']);
  const parties = useParties();
  const items = useItems();
  const documents = useDocuments();
  const payments = usePayments();
  const expenses = useExpenses();
  const stock = useStockLevels();
  const canOpen = useCanOpen();

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: SearchResult[] = [];

    parties.forEach((p) => {
      if (`${p.name} ${p.displayName ?? ''} ${p.code} ${p.phone ?? ''} ${p.email ?? ''} ${p.taxId ?? ''}`.toLowerCase().includes(q)) {
        out.push({
          id: p.id,
          group: p.kind === 'customer' ? 'Customers' : 'Suppliers',
          title: p.name,
          subtitle: `${p.code}${p.phone ? ` · ${p.phone}` : ''}`,
          icon: p.kind === 'customer' ? 'account-outline' : 'truck-outline',
          route: p.kind === 'customer' ? `/(app)/contacts/customers/${p.id}` : `/(app)/contacts/suppliers/${p.id}`,
        });
      }
    });

    items.forEach((i) => {
      if (`${i.name} ${i.sku} ${i.barcode ?? ''} ${i.hsnCode ?? ''}`.toLowerCase().includes(q)) {
        out.push({
          id: i.id,
          group: 'Items',
          title: i.name,
          subtitle: `${i.sku} · ${formatMoney(i.salePrice)}`,
          trailing: i.trackInventory ? `${formatQty(stock[i.id] ?? 0)} ${i.unit}` : 'Service',
          icon: i.trackInventory ? 'package-variant-closed' : 'hammer-wrench',
          route: `/(app)/catalog/items/${i.id}`,
        });
      }
    });

    documents.forEach((d) => {
      const partyName = parties.find((p) => p.id === d.partyId)?.name ?? '';
      if (`${d.number} ${partyName} ${d.reference ?? ''} ${d.supplierDocNumber ?? ''}`.toLowerCase().includes(q)) {
        out.push({
          id: d.id,
          group: documentKindLabel(tr, d.kind, 2),
          title: d.number,
          subtitle: `${partyName} · ${formatDate(d.date, 'dd MMM')}`,
          trailing: formatMoney(d.totals.grandTotal),
          icon: 'file-document-outline',
          route: detailRouteFor(d.kind, d.id),
        });
      }
    });

    payments.forEach((p) => {
      const partyName = parties.find((x) => x.id === p.partyId)?.name ?? '';
      if (`${p.number} ${partyName} ${p.reference ?? ''}`.toLowerCase().includes(q)) {
        out.push({
          id: p.id,
          group: 'Payments',
          title: p.number,
          subtitle: `${partyName} · ${formatDate(p.date, 'dd MMM')}`,
          trailing: formatMoney(p.amount),
          icon: p.direction === 'received' ? 'cash-plus' : 'cash-minus',
          route: `/(app)/payments/${p.id}`,
        });
      }
    });

    expenses.forEach((e) => {
      if (`${e.number} ${e.notes ?? ''} ${e.reference ?? ''}`.toLowerCase().includes(q)) {
        out.push({
          id: e.id,
          group: 'Expenses',
          title: e.number,
          subtitle: `${e.notes ?? 'Expense'} · ${formatDate(e.date, 'dd MMM')}`,
          trailing: formatMoney(e.amount),
          icon: 'receipt-text-outline',
          route: `/(app)/expenses/${e.id}`,
        });
      }
    });

    return out.filter((r) => canOpen(r.route)).slice(0, 60);
  }, [query, parties, items, documents, payments, expenses, stock, canOpen, tr]);

  const grouped = useMemo(() => {
    const map = new Map<string, SearchResult[]>();
    results.forEach((r) => map.set(r.group, [...(map.get(r.group) ?? []), r]));
    return Array.from(map.entries());
  }, [results]);

  return { results, grouped };
}
