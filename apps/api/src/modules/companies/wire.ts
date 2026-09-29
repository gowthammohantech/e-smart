import type { Schema } from '@esmart/api-contract';
import type { schema } from '@esmart/db';
import type { Deps } from '../../context';
import { addressFrom, addressTo, compact, versioned } from '../../lib/wire';

type CompanyRow = typeof schema.companies.$inferSelect;
type BranchRow = typeof schema.branches.$inferSelect;

export async function companyToWire(deps: Deps, row: CompanyRow, logoKey?: string | null): Promise<Schema<'Company'>> {
  const logoUri = logoKey ? (await deps.providers.storage.downloadUrl(logoKey, { ttlSeconds: 3600 })).url : undefined;
  return compact({
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    legalName: row.legalName,
    logoUri,
    businessType: row.businessType,
    country: row.country.trim(),
    baseCurrency: row.baseCurrency.trim(),
    address: addressFrom(row, 'address')!,
    email: row.email,
    phone: row.phone,
    website: row.website,
    taxRegistration: {
      regime: row.taxRegime,
      identifier: row.taxIdentifier,
      identifierLabel: row.taxIdentifierLabel,
      registered: row.taxRegistered,
      compositionScheme: row.compositionScheme,
      placeOfSupplyStateCode: row.placeOfSupplyStateCode,
    },
    fiscalYearStartMonth: row.fiscalYearStartMonth,
    plan: row.plan,
    ...versioned(row),
  });
}

/** Columns for a Company body. Server-owned fields (plan, ids) are not touched. */
export function companyColumns(body: Schema<'Company'>) {
  const tax = body.taxRegistration;
  return {
    name: body.name.trim(),
    legalName: body.legalName ?? null,
    businessType: body.businessType,
    country: body.country,
    baseCurrency: body.baseCurrency,
    ...addressTo('address', body.address),
    email: body.email ?? null,
    phone: body.phone ?? null,
    website: body.website ?? null,
    taxRegime: tax?.regime ?? 'NONE',
    taxIdentifier: tax?.identifier?.trim().toUpperCase() || null,
    taxIdentifierLabel: tax?.identifierLabel ?? 'GSTIN',
    taxRegistered: tax?.registered ?? false,
    compositionScheme: tax?.compositionScheme ?? false,
    placeOfSupplyStateCode: tax?.placeOfSupplyStateCode ?? body.address.stateCode ?? null,
    fiscalYearStartMonth: body.fiscalYearStartMonth,
  };
}

export function branchToWire(row: BranchRow): Schema<'Branch'> {
  return compact({
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    code: row.code,
    address: addressFrom(row, 'address')!,
    isPrimary: row.isPrimary,
    phone: row.phone,
    ...versioned(row),
  });
}
