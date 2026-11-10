import type { PaymentAccount } from '@esmart/core/types';
import { fromMajor } from '@esmart/core/lib/money';

export type PaymentAccountFormValues = {
  name: string;
  type: PaymentAccount['type'];
  currency: string;
  accountNumber: string;
  openingBalance: string;
  openingBalanceDate?: string;
  isDefault: boolean;
};

/**
 * The account the form saves: what was edited, over the account as it was. The currency is the
 * form's, which starts at the account's own, so saving a foreign-currency account keeps it (and its
 * opening balance stays in that currency).
 */
export function paymentAccountFromForm(editing: PaymentAccount, form: PaymentAccountFormValues, ids: { id: string; companyId: string }): PaymentAccount {
  return {
    ...editing,
    id: ids.id,
    companyId: ids.companyId,
    name: form.name.trim(),
    type: form.type,
    currency: form.currency,
    accountNumber: form.accountNumber.trim() || undefined,
    openingBalance: fromMajor(form.openingBalance || '0', form.currency),
    openingBalanceDate: form.openingBalanceDate,
    isDefault: form.isDefault,
  };
}
