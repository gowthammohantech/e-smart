import type { Party } from '@esmart/core/types';
import { normalizeGstin } from '@esmart/core/domain/gstin';
import { usePartySearch } from '../../remote/queries';
import { matchParty } from './matchParty';

/**
 * `matchParty` over what the server finds for the scanned GSTIN and name: the
 * device no longer holds every contact. `loading` until both searches answer.
 */
export function useScannedParty(kind: 'customer' | 'supplier', by: { gstin?: string; name?: string }, enabled: boolean) {
  const gstin = usePartySearch(kind, by.gstin ? normalizeGstin(by.gstin) : '', enabled && !!by.gstin);
  const name = usePartySearch(kind, by.name?.trim().split(/\s+/).slice(0, 2).join(' ') ?? '', enabled && !!by.name?.trim());
  const found = [...(gstin.data ?? []), ...(name.data ?? [])] as unknown as Party[];
  return { id: enabled ? matchParty(found, by) : undefined, loading: gstin.isLoading || name.isLoading };
}
