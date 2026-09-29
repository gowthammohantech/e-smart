import { defineHandlers } from '../../context';
import { accountHandlers } from './accounts';
import { categoryHandlers } from './categories';
import { numberingHandlers } from './numbering';
import { rateHandlers } from './rates';
import { transporterHandlers } from './transporters';

/**
 * Settings: listTaxCategories, createTaxCategory, saveTaxCategory, removeTaxCategory, listExpenseCategories, createExpenseCategory, saveExpenseCategory, removeExpenseCategory, listPaymentAccounts, createPaymentAccount, savePaymentAccount, removePaymentAccount, listExchangeRates, createExchangeRate, saveExchangeRate, removeExchangeRate, listTransporters, createTransporter, saveTransporter, removeTransporter, refreshExchangeRates, listNumberingSeries, saveNumberingSeries, previewNextNumber.
 */
export const settingsHandlers = defineHandlers({
  ...categoryHandlers,
  ...accountHandlers,
  ...rateHandlers,
  ...transporterHandlers,
  ...numberingHandlers,
});

export { paymentAccountBalances } from './accounts';
