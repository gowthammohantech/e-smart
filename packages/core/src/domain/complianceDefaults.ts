import type { ComplianceSettings } from '../types';
import { fromMajor, zero } from '../lib/money';
import { nowISO } from '../lib/date';

/**
 * Compliance configuration, one row per company (FRD 16).
 *
 * Kept as its own record rather than a field on `Company`, because the business
 * profile form replaces the whole company object on save and would otherwise
 * wipe this on an unrelated edit.
 */
export function defaultComplianceSettings(companyId: string, baseCurrency = 'INR'): ComplianceSettings {
  return {
    companyId,
    eInvoiceEnabled: true,
    annualTurnover: zero(baseCurrency),
    // Mandatory for businesses at or above 5 crore of aggregate turnover.
    eInvoiceTurnoverThreshold: fromMajor('50000000', baseCurrency),
    reportingWindowDays: 30,
    autoGenerateEInvoiceOnFinalise: false,
    irpEnvironment: 'sandbox',
    ewayBillEnabled: true,
    // The statute sets 50,000; several states set a higher intra-state figure.
    ewayBillThreshold: fromMajor('50000', baseCurrency),
    autoGenerateEwayBillOnFinalise: false,
    defaultDistanceKm: 120,
    defaultTransportMode: 'road',
    defaultVehicleType: 'regular',
    updatedAt: nowISO(),
  };
}
