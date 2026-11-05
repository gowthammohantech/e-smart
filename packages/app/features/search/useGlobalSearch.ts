import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { IconName } from '@esmart/ui/components/Icon';
import { useCanOpen } from '../../store/selectors';
import { useServerSearch } from '../../remote/queries';
import { useDebounced } from '../../components/useDebounced';
import { documentKindLabel } from '@esmart/core/labels';
import type { DocumentKind } from '@esmart/core/types';
import type { Money } from '@esmart/core/lib/money';
import { detailRouteFor } from '../documents/DocumentEditor';
import { formatMoney, formatQty } from '@esmart/core/lib/format';
import { formatDate } from '@esmart/core/lib/date';

export type SearchResult = {
  id: string;
  group: string;
  title: string;
  subtitle: string;
  trailing?: string;
  icon: IconName;
  route: string;
};

/**
 * Every record the active company owns that matches `query` (two characters
 * or more), grouped for display, searched on the server. Shared by the
 * search screen and the desktop command palette.
 */
export function useGlobalSearch(query: string) {
  const { t: tr } = useTranslation(['common', 'domain', 'nav']);
  const canOpen = useCanOpen();
  const { found, expenses, isFetching } = useServerSearch(useDebounced(query), canOpen('/(app)/expenses'));

  const results = useMemo<SearchResult[]>(() => {
    if (query.trim().length < 2 || !found) return [];
    const out: SearchResult[] = [];

    (found.parties ?? []).forEach((p) => {
      out.push({
        id: p.id!,
        group: p.kind !== 'supplier' ? 'Customers' : 'Suppliers',
        title: p.name!,
        subtitle: `${p.code ?? ''}${p.phone ? ` · ${p.phone}` : ''}`,
        icon: p.kind !== 'supplier' ? 'account-outline' : 'truck-outline',
        route: p.kind !== 'supplier' ? `/(app)/contacts/customers/${p.id}` : `/(app)/contacts/suppliers/${p.id}`,
      });
    });

    (found.items ?? []).forEach((i) => {
      out.push({
        id: i.id!,
        group: 'Items',
        title: i.name!,
        subtitle: `${i.sku ?? ''} · ${formatMoney(i.salePrice as Money)}`,
        trailing: i.trackInventory ? `${formatQty(i.stockOnHand ?? 0)} ${i.unit ?? ''}` : 'Service',
        icon: i.trackInventory ? 'package-variant-closed' : 'hammer-wrench',
        route: `/(app)/catalog/items/${i.id}`,
      });
    });

    (found.documents ?? []).forEach((d) => {
      out.push({
        id: d.id!,
        group: documentKindLabel(tr, d.kind as DocumentKind, 2),
        title: d.number!,
        subtitle: `${d.partyName ?? ''} · ${formatDate(d.date!, 'dd MMM')}`,
        trailing: d.grandTotal ? formatMoney(d.grandTotal as Money) : undefined,
        icon: 'file-document-outline',
        route: detailRouteFor(d.kind as DocumentKind, d.id!),
      });
    });

    (found.payments ?? []).forEach((p) => {
      out.push({
        id: p.id!,
        group: 'Payments',
        title: p.number!,
        subtitle: `${(p as { partyName?: string }).partyName ?? ''} · ${formatDate(p.date!, 'dd MMM')}`,
        trailing: formatMoney(p.amount as Money),
        icon: p.direction === 'received' ? 'cash-plus' : 'cash-minus',
        route: `/(app)/payments/${p.id}`,
      });
    });

    expenses.forEach((e) => {
      out.push({
        id: e.id!,
        group: 'Expenses',
        title: e.number!,
        subtitle: `${e.notes ?? 'Expense'} · ${formatDate(e.date!, 'dd MMM')}`,
        trailing: formatMoney(e.amount as Money),
        icon: 'receipt-text-outline',
        route: `/(app)/expenses/${e.id}`,
      });
    });

    return out.filter((r) => canOpen(r.route)).slice(0, 60);
  }, [query, found, expenses, canOpen, tr]);

  const grouped = useMemo(() => {
    const map = new Map<string, SearchResult[]>();
    results.forEach((r) => map.set(r.group, [...(map.get(r.group) ?? []), r]));
    return Array.from(map.entries());
  }, [results]);

  return { results, grouped, isFetching };
}
