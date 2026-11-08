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
  const settled = useDebounced(query);
  const { found, expenses, isFetching, isError, refetch } = useServerSearch(settled, canOpen('/(app)/expenses'));
  // Typed but not yet asked (the search waits for typing to pause) counts as still looking, so "No matches" doesn't flash.
  const pending = query.trim().length >= 2 && (isFetching || settled !== query);
  /** The parts that are there, joined: no leading or doubled " · " when one is missing. */
  const join = (...parts: (string | undefined | null | false)[]) => parts.filter(Boolean).join(' · ');

  const results = useMemo<SearchResult[]>(() => {
    if (query.trim().length < 2 || !found) return [];
    const out: SearchResult[] = [];

    (found.parties ?? []).forEach((p) => {
      out.push({
        id: p.id!,
        group: p.kind !== 'supplier' ? tr('common:search.group.customers') : tr('common:search.group.suppliers'),
        title: p.name!,
        subtitle: join(p.code, p.phone),
        icon: p.kind !== 'supplier' ? 'account-outline' : 'truck-outline',
        route: p.kind !== 'supplier' ? `/(app)/contacts/customers/${p.id}` : `/(app)/contacts/suppliers/${p.id}`,
      });
    });

    (found.items ?? []).forEach((i) => {
      out.push({
        id: i.id!,
        group: tr('common:search.group.items'),
        title: i.name!,
        subtitle: join(i.sku, i.salePrice != null && formatMoney(i.salePrice as Money)),
        trailing: i.trackInventory ? `${formatQty(i.stockOnHand ?? 0)} ${i.unit ?? ''}`.trim() : tr('common:search.service'),
        icon: i.trackInventory ? 'package-variant-closed' : 'hammer-wrench',
        route: `/(app)/catalog/items/${i.id}`,
      });
    });

    (found.documents ?? []).forEach((d) => {
      out.push({
        id: d.id!,
        group: documentKindLabel(tr, d.kind as DocumentKind, 2),
        title: d.number!,
        subtitle: join(d.partyName, d.date && formatDate(d.date, 'dd MMM')),
        trailing: d.grandTotal ? formatMoney(d.grandTotal as Money) : undefined,
        icon: 'file-document-outline',
        route: detailRouteFor(d.kind as DocumentKind, d.id!),
      });
    });

    (found.payments ?? []).forEach((p) => {
      out.push({
        id: p.id!,
        group: tr('common:search.group.payments'),
        title: p.number!,
        subtitle: join((p as { partyName?: string }).partyName, p.date && formatDate(p.date, 'dd MMM')),
        trailing: formatMoney(p.amount as Money),
        icon: p.direction === 'received' ? 'cash-plus' : 'cash-minus',
        route: `/(app)/payments/${p.id}`,
      });
    });

    expenses.forEach((e) => {
      out.push({
        id: e.id!,
        group: tr('common:search.group.expenses'),
        title: e.number!,
        subtitle: join(e.notes || tr('common:search.expense'), e.date && formatDate(e.date, 'dd MMM')),
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

  return { results, grouped, isFetching, pending, isError: isError && !pending, refetch };
}
