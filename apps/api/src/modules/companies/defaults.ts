import type { Schema } from '@esmart/api-contract';
import { expenseCategories, gstCategories } from '@esmart/core/data/masters';
import { defaultComplianceSettings } from '@esmart/core/data/seed';
import { DEFAULT_PREFIXES, SERIES_KINDS, defaultSeries } from '@esmart/core/domain/numbering';
import { schema } from '@esmart/db';
import type { DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';

type Series = Schema<'NumberingSeries'>;

/**
 * One numbering series per kind. What onboarding sent wins; every kind it
 * left out gets the default (INV/26-27/0001, yearly reset).
 */
export async function createNumberingSeries(tx: DbOrTx, companyId: string, given: Series[] = []) {
  const byKind = new Map(given.map((s) => [s.kind, s]));
  await tx.insert(schema.numberingSeries).values(
    SERIES_KINDS.map((kind) => {
      const d = defaultSeries(companyId, kind, DEFAULT_PREFIXES[kind]);
      const s = byKind.get(kind);
      return {
        id: newId('ser'),
        companyId,
        kind,
        prefix: s?.prefix ?? d.prefix,
        nextNumber: s?.nextNumber ?? d.nextNumber,
        padding: s?.padding ?? d.padding,
        includeFiscalYear: s?.includeFiscalYear ?? d.includeFiscalYear,
        includeBranchCode: s?.includeBranchCode ?? d.includeBranchCode,
        resetPolicy: s?.resetPolicy ?? d.resetPolicy,
      };
    }),
  );
}

/**
 * What a new company starts with (`seedDefaults`): tax categories for its
 * regime, expense categories, a default cash account, and compliance
 * settings. Mirrors what onboarding creates in the app.
 */
export async function seedCompanyDefaults(
  tx: DbOrTx,
  company: { id: string; baseCurrency: string; taxRegime: 'GST' | 'VAT' | 'NONE'; country: string },
) {
  const currency = company.baseCurrency.trim();
  const taxes =
    company.taxRegime === 'GST'
      ? gstCategories(company.id).map((t) => ({ name: t.name, rate: t.rate, type: 'GST' as const, effectiveFrom: t.effectiveFrom, description: t.description }))
      : company.taxRegime === 'VAT'
        ? [
            { name: 'VAT 0%', rate: 0, type: 'VAT' as const, effectiveFrom: '2018-01-01', description: 'Zero-rated and exempt supplies' },
            { name: 'VAT 5%', rate: 5, type: 'VAT' as const, effectiveFrom: '2018-01-01', description: 'Standard rate' },
          ]
        : [{ name: 'No tax', rate: 0, type: 'NONE' as const, effectiveFrom: '2000-01-01', description: 'Not registered for tax' }];
  await tx.insert(schema.taxCategories).values(
    taxes.map((t) => ({
      id: newId('tax'),
      companyId: company.id,
      name: t.name,
      rate: String(t.rate),
      type: t.type,
      effectiveFrom: t.effectiveFrom,
      description: t.description ?? null,
    })),
  );

  await tx.insert(schema.expenseCategories).values(
    expenseCategories(company.id).map((c) => ({ id: newId('exc'), companyId: company.id, name: c.name, icon: c.icon, color: c.color })),
  );

  await tx.insert(schema.paymentAccounts).values({
    id: newId('pac'),
    companyId: company.id,
    name: 'Cash',
    type: 'cash',
    currency,
    openingBalanceMinor: 0,
    isDefault: true,
  });

  const c = defaultComplianceSettings(company.id, currency);
  const gst = company.taxRegime === 'GST' && company.country === 'IN';
  await tx.insert(schema.complianceSettings).values({
    companyId: company.id,
    // E-invoicing and e-way bills are Indian GST; elsewhere they stay off.
    einvoiceEnabled: gst && c.eInvoiceEnabled,
    annualTurnoverMinor: c.annualTurnover.minor,
    einvoiceTurnoverThresholdMinor: c.eInvoiceTurnoverThreshold.minor,
    currency,
    reportingWindowDays: c.reportingWindowDays,
    autoGenerateEinvoiceOnFinalise: c.autoGenerateEInvoiceOnFinalise,
    irpEnvironment: c.irpEnvironment,
    ewayBillEnabled: gst && c.ewayBillEnabled,
    ewayBillThresholdMinor: c.ewayBillThreshold.minor,
    autoGenerateEwayBillOnFinalise: c.autoGenerateEwayBillOnFinalise,
    defaultDistanceKm: c.defaultDistanceKm,
    defaultTransportMode: c.defaultTransportMode,
    defaultVehicleType: c.defaultVehicleType,
  });

  await tx.insert(schema.backupSettings).values({ companyId: company.id }).onConflictDoNothing();
}
