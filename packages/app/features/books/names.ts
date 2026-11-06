import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { tdsSection } from '@esmart/core/data/tdsSections';
import type { Account } from '@esmart/core/domain/ledger/accounts';
import type { LedgerGroup } from '@esmart/core/types';
import { formatMoney } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';

/** An account's name in the reader's language: system accounts are translated, the rest are the business's own. */
export function useAccountName() {
  const { t: tr } = useTranslation(['books']);
  return useCallback(
    (account: Pick<Account, 'key' | 'name' | 'kind'>) => {
      if (account.kind !== 'system') return account.name;
      const [, id, section] = account.key.split(':');
      if (id === 'tdsPayable' && section) return tr('books:account.tdsPayableSection', { section: tdsSection(section)?.label ?? section });
      if (id === 'tdsReceivable' && section) return tr('books:account.tdsReceivableSection', { section: tdsSection(section)?.label ?? section });
      return tr(`books:account.${id}` as 'books:account.sales', { defaultValue: account.name });
    },
    [tr],
  );
}

export function useGroupName() {
  const { t: tr } = useTranslation(['books']);
  return useCallback((group: LedgerGroup) => tr(`books:group.${group}`), [tr]);
}

/** A balance as "12,500.00 Dr" or "Cr": debit positive. */
export function useDrCr() {
  const { t: tr } = useTranslation(['books']);
  return useCallback(
    (minor: number, currency: string) => (minor === 0 ? formatMoney(money(0, currency)) : `${formatMoney(money(Math.abs(minor), currency))} ${minor > 0 ? tr('books:accounts.dr') : tr('books:accounts.cr')}`),
    [tr],
  );
}
