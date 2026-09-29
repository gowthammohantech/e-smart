import { defineHandlers } from '../../context';
import { eInvoiceHandlers } from './einvoice';
import { ewayHandlers } from './eway';
import { settingsHandlers } from './settings';

export { afterFinalize } from './einvoice';

/**
 * Compliance: getComplianceSettings, saveComplianceSettings, saveComplianceCredentials, testComplianceConnection, getEInvoice, generateEInvoice, cancelEInvoice, listEwayBills, generateEwayBill, getEwayBill, getEwayBillPdf, updateEwayBillPartB, extendEwayBill, cancelEwayBill.
 */
export const complianceHandlers = defineHandlers({ ...settingsHandlers, ...eInvoiceHandlers, ...ewayHandlers });
