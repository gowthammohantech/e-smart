import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { formatPercent } from '@esmart/core/lib/format';
import { searchHsn, type HsnMatch } from '../../remote/reference';

/**
 * The HSN/SAC master, searched as it is typed (by code or description), for the item forms on a
 * phone and a desktop alike. Picking a row hands the whole match back: the form fills the code, and
 * the description and GST rate it usually carries.
 */
export function HsnSearchSheet({ visible, onClose, value, onPick }: { visible: boolean; onClose: () => void; value?: string; onPick: (match: HsnMatch) => void }) {
  const { t: tr } = useTranslation(['inventory']);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<HsnMatch[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let live = true;
    const q = visible ? query.trim() : '';
    // Every state change is made from the timer, not the effect body itself: nothing to search clears the list at once.
    const timer = setTimeout(
      () => {
        if (!q) {
          setMatches([]);
          setLoading(false);
          return;
        }
        setLoading(true);
        searchHsn(q)
          .then((rows) => live && setMatches(rows))
          .catch(() => live && setMatches([]))
          .finally(() => live && setLoading(false));
      },
      q ? 250 : 0,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [visible, query]);

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
    />
  );
}
