import { useCallback, useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { DATE_RANGE_PRESET_KEYS, DateRangePreset } from '@esmart/core/lib/date';

export type QueryParams = Record<string, string | undefined>;

/**
 * The screen's query string, one string per key, and a setter that merges a
 * patch into it (`undefined` or '' drops the key). Lists keep their filters
 * here rather than in state, so a filtered view survives a refresh and back,
 * and can be linked to — the home screen opens `/sales/invoices?status=draft`.
 */
export function useQueryParams(): [QueryParams, (patch: QueryParams) => void] {
  const raw = useLocalSearchParams();
  const router = useRouter();
  const key = JSON.stringify(raw);
  const params = useMemo(() => {
    const out: QueryParams = {};
    for (const [k, v] of Object.entries(raw)) out[k] = Array.isArray(v) ? v[0] : v;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const setParams = useCallback(
    (patch: QueryParams) => router.setParams(Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v || undefined]))),
    [router],
  );
  return [params, setParams];
}

/** `draft,sent` ⇄ `['draft', 'sent']`. */
export const listParam = {
  parse: <T extends string>(v: string | undefined): T[] => (v ? (v.split(',').filter(Boolean) as T[]) : []),
  format: (v: readonly string[]): string | undefined => (v.length ? v.join(',') : undefined),
};

/** A preset from the URL, or `fallback` when it is missing or not one we offer. */
export function presetParam(v: string | undefined, fallback: DateRangePreset): DateRangePreset {
  return v && DATE_RANGE_PRESET_KEYS.includes(v as DateRangePreset) ? (v as DateRangePreset) : fallback;
}
