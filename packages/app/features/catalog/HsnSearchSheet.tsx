import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { Button } from '@esmart/ui/components/Button';
import { formatPercent } from '@esmart/core/lib/format';
import { searchHsn, type HsnMatch } from '../../remote/reference';

/**
 * The HSN/SAC master, listed as soon as it opens and narrowed as it is typed (by code or description),
 * for the item forms on a phone and a desktop alike. 50 codes at a time, in code order, with Load more
 * for the next 50. Picking a row hands the match back; the form takes its code.
 */
export function HsnSearchSheet({ visible, onClose, value, onPick }: { visible: boolean; onClose: () => void; value?: string; onPick: (match: HsnMatch) => void }) {
  const { t: tr } = useTranslation(['inventory', 'common']);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<HsnMatch[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // The search the list on screen is for: a page that comes back for an older one is dropped.
  const current = useRef('');

  useEffect(() => {
    let live = true;
    const q = query.trim();
    // Every state change is made from the timer, not the effect body itself. Closed, nothing is asked;
    // open with nothing typed, the list from the start shows at once.
    const timer = setTimeout(
      () => {
        if (!visible) {
          setLoading(false);
          return;
        }
        current.current = q;
        setLoading(true);
        searchHsn(q)
          .then((page) => {
            if (!live) return;
            setMatches(page.rows);
            setNextCursor(page.nextCursor);
          })
          .catch(() => {
            if (!live) return;
            setMatches([]);
            setNextCursor(null);
          })
          .finally(() => live && setLoading(false));
      },
      q ? 250 : 0,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [visible, query]);

  const loadMore = () => {
    if (!nextCursor || loadingMore) return;
    const q = current.current;
    setLoadingMore(true);
    searchHsn(q, nextCursor)
      .then((page) => {
        if (current.current !== q) return;
        // Codes come in order after the cursor, so a page only adds; one already listed is skipped.
        setMatches((have) => [...have, ...page.rows.filter((r) => !have.some((h) => h.code === r.code))]);
        setNextCursor(page.nextCursor);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  };

  return (
    <SelectSheet
      visible={visible}
      onClose={onClose}
      title={tr('inventory:form.hsnSearchTitle')}
      searchPlaceholder={tr('inventory:form.hsnSearchPlaceholder')}
      options={matches.map((h) => ({
        value: h.code ?? '',
        label: `${h.code} · ${h.description ?? ''}`,
        description: h.gstRate == null ? h.kind : tr('inventory:form.hsnRate', { kind: h.kind, rate: formatPercent(h.gstRate) }),
      }))}
      value={value || null}
      onSelect={(code) => {
        const match = matches.find((h) => h.code === code);
        if (match) onPick(match);
      }}
      onQueryChange={setQuery}
      loading={loading}
      emptyMessage={tr(query.trim() ? 'inventory:form.hsnNoMatch' : 'inventory:form.hsnTypeToSearch')}
      footer={
        nextCursor && !loading ? (
          <Button title={tr('common:documentList.loadMore')} variant="ghost" size="sm" loading={loadingMore} onPress={loadMore} style={{ alignSelf: 'center' }} />
        ) : undefined
      }
    />
  );
}
