import type { Schema } from '@esmart/api-contract';
import type { schema } from '@esmart/db';
import type { Deps } from '../../context';
import { addressTo, compact, requiredAddressFrom, versioned } from '../../lib/wire';

type CompanyRow = typeof schema.companies.$inferSelect;
type BranchRow = typeof schema.branches.$inferSelect;

/** The bank account on a company row, or undefined when none of it is filled in. */
export function bankDetailsOf(row: CompanyRow): Schema<'BankDetails'> | undefined {
  const b = compact({
    bankName: row.bankName,
    accountName: row.bankAccountName,
    accountNumber: row.bankAccountNumber,
    ifsc: row.bankIfsc,
    branch: row.bankBranch,
    upiId: row.upiId,
  });
  return Object.keys(b).length ? b : undefined;
}

export async function companyToWire(deps: Deps, row: CompanyRow, logoKey?: string | null, signatureKey?: string | null): Promise<Schema<'Company'>> {
  const link = async (key?: string | null) => (key ? (await deps.providers.storage.downloadUrl(key, { ttlSeconds: 3600 })).url : undefined);
  return compact({
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    legalName: row.legalName,
    logoUri: await link(logoKey),
    signatureUri: await link(signatureKey),
    bankDetails: bankDetailsOf(row),
    businessType: row.businessType,
    country: row.country.trim(),
    baseCurrency: row.baseCurrency.trim(),
    address: requiredAddressFrom(row, 'address'),
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
      lutNumber: row.lutNumber,
      lutValidTill: row.lutValidTill,
      returnFrequency: row.returnFrequency,
    },
    fiscalYearStartMonth: row.fiscalYearStartMonth,
    lockedThroughDate: row.lockedThroughDate,
    perpetualStockFrom: row.perpetualStockFrom,
    allowNegativeStock: row.allowNegativeStock,
    msmeBankRate: Number(row.msmeBankRate),
    gstr2bDateToleranceDays: row.gstr2bDateToleranceDays,
    tan: row.tan,
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
    email: body.email?.trim().toLowerCase() || null,
    phone: body.phone ?? null,
    website: body.website ?? null,
    taxRegime: tax?.regime ?? 'NONE',
    taxIdentifier: tax?.identifier?.trim().toUpperCase() || null,
    taxIdentifierLabel: tax?.identifierLabel ?? 'GSTIN',
    taxRegistered: tax?.registered ?? false,
    compositionScheme: tax?.compositionScheme ?? false,
    placeOfSupplyStateCode: tax?.placeOfSupplyStateCode ?? body.address.stateCode ?? null,
    lutNumber: tax?.lutNumber?.trim().toUpperCase() || null,
    lutValidTill: tax?.lutNumber?.trim() ? (tax.lutValidTill ?? null) : null,
    // Left alone when a client that predates the setting saves the company.
    ...(tax?.returnFrequency && { returnFrequency: tax.returnFrequency }),
    fiscalYearStartMonth: body.fiscalYearStartMonth,
    // Left alone when a client that predates the setting saves the company.
    ...(body.allowNegativeStock !== undefined && { allowNegativeStock: body.allowNegativeStock }),
    ...(body.msmeBankRate !== undefined && { msmeBankRate: String(body.msmeBankRate) }),
    ...(body.gstr2bDateToleranceDays !== undefined && { gstr2bDateToleranceDays: body.gstr2bDateToleranceDays }),
    ...(body.tan !== undefined && { tan: body.tan.trim().toUpperCase() || null }),
    // Sent whole: an empty field clears it; left out, the account stays as it is (an older client).
    ...(body.bankDetails !== undefined && bankColumns(body.bankDetails)),
  };
}

function bankColumns(b: Schema<'BankDetails'>) {
  const text = (v?: string) => v?.trim() || null;
  return {
    bankName: text(b.bankName),
    bankAccountName: text(b.accountName),
    bankAccountNumber: text(b.accountNumber)?.replace(/\s+/g, '').toUpperCase() ?? null,
    bankIfsc: text(b.ifsc)?.toUpperCase() ?? null,
    bankBranch: text(b.branch),
    upiId: text(b.upiId)?.toLowerCase() ?? null,
  };
}

export function branchToWire(row: BranchRow): Schema<'Branch'> {
  return compact({
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    code: row.code,
    address: requiredAddressFrom(row, 'address'),
    isPrimary: row.isPrimary,
    phone: row.phone,
    gstin: row.gstin,
    ...versioned(row),
  });
}
