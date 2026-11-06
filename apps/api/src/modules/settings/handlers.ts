import { defineHandlers } from '../../context';
import { accountHandlers } from './accounts';
import { categoryHandlers } from './categories';
import { numberingHandlers } from './numbering';
import { rateHandlers } from './rates';
import { transporterHandlers } from './transporters';
import { usageHandlers } from './usage';

/**
 * Settings: listTaxCategories, createTaxCategory, saveTaxCategory, removeTaxCategory, listExpenseCategories, createExpenseCategory, saveExpenseCategory, removeExpenseCategory, listPaymentAccounts, createPaymentAccount, savePaymentAccount, removePaymentAccount, listExchangeRates, createExchangeRate, saveExchangeRate, removeExchangeRate, listTransporters, createTransporter, saveTransporter, removeTransporter, refreshExchangeRates, listNumberingSeries, saveNumberingSeries, previewNextNumber, getCompanyUsage.
 */
export const settingsHandlers = defineHandlers({
  ...categoryHandlers,
  ...accountHandlers,
  ...rateHandlers,
  ...transporterHandlers,
  ...numberingHandlers,
  ...usageHandlers,
});

export { paymentAccountBalances } from './accounts';
