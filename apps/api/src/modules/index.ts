import type { Handlers } from '../context';
import { authHandlers } from './auth/handlers';
import { meHandlers } from './me/handlers';
import { companiesHandlers } from './companies/handlers';
import { usersHandlers } from './users/handlers';
import { billingHandlers } from './billing/handlers';
import { settingsHandlers } from './settings/handlers';
import { complianceHandlers } from './compliance/handlers';
import { partiesHandlers } from './parties/handlers';
import { catalogHandlers } from './catalog/handlers';
import { documentsHandlers } from './documents/handlers';
import { paymentsHandlers } from './payments/handlers';
import { expensesHandlers } from './expenses/handlers';
import { inventoryHandlers } from './inventory/handlers';
import { attachmentsHandlers } from './attachments/handlers';
import { ocrHandlers } from './ocr/handlers';
import { ledgerHandlers } from './ledger/handlers';
import { reportsHandlers } from './reports/handlers';
import { gstHandlers } from './gst/handlers';
import { dashboardHandlers } from './dashboard/handlers';
import { searchHandlers } from './search/handlers';
import { notificationsHandlers } from './notifications/handlers';
import { auditHandlers } from './audit/handlers';
import { integrationsHandlers } from './integrations/handlers';
import { exportsHandlers } from './exports/handlers';
import { syncHandlers } from './sync/handlers';
import { referenceHandlers } from './reference/handlers';
import { lixiHandlers } from './lixi/handlers';
import { platformHandlers } from './platform/handlers';
export { webhookHandlers } from './webhooks/handlers';

/** Every module's handlers, keyed by operationId. */
export const handlers: Handlers = {
  ...authHandlers,
  ...meHandlers,
  ...companiesHandlers,
  ...usersHandlers,
  ...billingHandlers,
  ...settingsHandlers,
  ...complianceHandlers,
  ...partiesHandlers,
  ...catalogHandlers,
  ...documentsHandlers,
  ...paymentsHandlers,
  ...expensesHandlers,
  ...inventoryHandlers,
  ...attachmentsHandlers,
  ...ocrHandlers,
  ...ledgerHandlers,
  ...reportsHandlers,
  ...gstHandlers,
  ...dashboardHandlers,
  ...searchHandlers,
  ...notificationsHandlers,
  ...auditHandlers,
  ...integrationsHandlers,
  ...exportsHandlers,
  ...syncHandlers,
  ...referenceHandlers,
  ...lixiHandlers,
  ...platformHandlers,
};
