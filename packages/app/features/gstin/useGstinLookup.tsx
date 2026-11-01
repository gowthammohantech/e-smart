import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { isValidGstin, normalizeGstin } from '@esmart/core/domain/gstin';
import { lookupGstin, type GstinDetails } from '../../remote/reference';

export type { GstinDetails } from '../../remote/reference';

type Outcome = { gstin: string } & ({ kind: 'found'; details: GstinDetails } | { kind: 'notFound' } | { kind: 'failed' });

/**
 * Looks a GSTIN up on the GST portal as soon as all 15 characters are in and
 * its check digit is right, and hands the registered name and address to
 * `fill`, so a party or branch fills itself in. The GSTIN a record was opened
 * with isn't looked up again, so opening one to edit doesn't overwrite what
 * was saved; typing a different one does.
 *
 * Returns the GSTIN field's hint and suffix: a spinner while it looks, a tick
 * once it is filled, and why not when it couldn't be.
 */
export function useGstinLookup({ gstin, opened, enabled = true, fill }: { gstin: string; opened?: string; enabled?: boolean; fill: (details: GstinDetails) => void }): {
  hint?: string;
  suffix?: React.ReactNode;
} {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // The form's latest setters, without looking the GSTIN up again each render.
  const fillRef = useRef(fill);
  useLayoutEffect(() => {
    fillRef.current = fill;
  });

  const clean = normalizeGstin(gstin);
  const ready = enabled && clean.length === 15 && isValidGstin(clean) && clean !== normalizeGstin(opened ?? '');

  useEffect(() => {
    if (!ready) return;
    let live = true;
    lookupGstin(clean).then(
      (details) => {
        if (!live) return;
        setOutcome(details ? { gstin: clean, kind: 'found', details } : { gstin: clean, kind: 'notFound' });
        if (details) fillRef.current(details);
      },
      () => {
        if (live) setOutcome({ gstin: clean, kind: 'failed' });
      },
    );
    return () => {
      live = false;
    };
  }, [ready, clean]);

  if (!ready) return {};
  if (outcome?.gstin !== clean) return { hint: tr('common:gstinLookup.fetching'), suffix: <ActivityIndicator size="small" color={t.c.primary} /> };
  if (outcome.kind === 'notFound') return { hint: tr('common:gstinLookup.notFound') };
  if (outcome.kind === 'failed') return { hint: tr('common:gstinLookup.failed') };
  const { status } = outcome.details;
  if (status && status !== 'Active') {
    return { hint: tr('common:gstinLookup.inactive', { status }), suffix: <MaterialCommunityIcons name="alert-circle-outline" size={18} color={t.c.warn} /> };
  }
  return { hint: tr('common:gstinLookup.filled'), suffix: <MaterialCommunityIcons name="check-decagram" size={18} color={t.c.good} /> };
}
