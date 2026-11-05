import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Schema } from '@esmart/api-client';
import { useAppStore } from '../store/appStore';
import { api } from './api';
import { RemoteError } from './errors';

export type PartyStatement = Schema<'PartyStatement'>;
export type StatementRange = { from: string; to: string };

const params = (companyId: string, id: string, range: StatementRange) => ({ path: { companyId, id }, query: range });

/**
 * A party's running ledger from the server (`getPartyStatement`): the opening balance at `from`,
 * every document, payment and voucher to `to`, and the balance after each.
 */
export function usePartyStatement(partyId: string | undefined, range: StatementRange) {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: ['partyStatement', companyId, partyId, range.from, range.to],
    enabled: !!companyId && !!partyId,
    queryFn: async ({ signal }) => {
      const { data } = await api.GET('/companies/{companyId}/parties/{id}/statement', { params: params(companyId, partyId!, range), signal });
      return data as PartyStatement;
    },
    placeholderData: keepPreviousData,
  });
}

/** The same statement printed by the server, as PDF bytes to save or share. */
export async function partyStatementPdf(companyId: string, partyId: string, range: StatementRange): Promise<Uint8Array> {
  const { data } = await api.GET('/companies/{companyId}/parties/{id}/statement', {
    params: params(companyId, partyId, range),
    headers: { accept: 'application/pdf' },
    parseAs: 'arrayBuffer',
  });
  if (!data) throw new RemoteError('noPdf', 'The server returned no PDF');
  return new Uint8Array(data as unknown as ArrayBuffer);
}
