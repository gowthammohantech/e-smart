import type { Schema } from '@esmart/api-contract';
import type { schema } from '@esmart/db';
import type { PartyBalance } from '../../lib/balances';
import { addressFrom, addressTo, compact, maybeMoney, money, requiredAddressFrom, versioned } from '../../lib/wire';

type PartyRow = typeof schema.parties.$inferSelect;

export function partyToWire(row: PartyRow): Schema<'Party'> {
  const currency = row.currency.trim();
  return compact({
    id: row.id,
    companyId: row.companyId,
    kind: row.kind,
    name: row.name,
    code: row.code,
    displayName: row.displayName,
    taxId: row.taxId,
    gstRegistrationType: row.gstRegistrationType,
    pan: row.pan,
    msmeType: row.msmeType,
    udyamNumber: row.udyamNumber,
    reverseCharge: row.reverseCharge || undefined,
    tdsSection: (row.tdsSection ?? undefined) as Schema<'Party'>['tdsSection'],
    lowerTdsCertificate: row.lowerTdsRate !== null && row.lowerTdsValidTill ? { rate: Number(row.lowerTdsRate), validTill: row.lowerTdsValidTill } : undefined,
    email: row.email,
    phone: row.phone,
    currency,
    billingAddress: requiredAddressFrom(row, 'billing'),
    shippingAddress: addressFrom(row, 'shipping'),
    creditLimit: maybeMoney(row.creditLimitMinor, currency),
    openingBalance: money(row.openingBalanceMinor, currency),
    openingBalanceDate: row.openingBalanceDate,
    openingBalanceSide: row.openingBalanceSide ?? undefined,
    paymentTermsDays: row.paymentTermsDays,
    notes: row.notes,
    customFields: row.customFields as Record<string, unknown>,
    status: row.status,
    ...versioned(row),
  });
}

export function partyWithBalance(row: PartyRow, balance: PartyBalance | undefined, payable?: PartyBalance): Schema<'PartyWithBalance'> {
  const currency = row.currency.trim();
  return {
    ...partyToWire(row),
    outstanding: money(balance?.outstanding ?? 0, currency),
    overdue: money(balance?.overdue ?? 0, currency),
    advance: money(balance?.advance ?? 0, currency),
    // A party that is both: what we owe them on bills, beside what they owe on invoices.
    ...(row.kind === 'both' && { payable: money(payable?.outstanding ?? 0, currency) }),
  };
}

/** Columns from a Party body. Code and ids are handled by the caller. */
export function partyColumns(body: Schema<'Party'>) {
  return {
    kind: body.kind,
    name: body.name.trim(),
    displayName: body.displayName ?? null,
    taxId: body.taxId?.trim().toUpperCase() || null,
    gstRegistrationType: body.gstRegistrationType ?? (body.taxId ? 'regular' : null),
    pan: body.pan?.trim().toUpperCase() || panFromGstin(body.taxId),
    msmeType: body.msmeType ?? null,
    udyamNumber: body.udyamNumber?.trim().toUpperCase() || null,
    reverseCharge: body.reverseCharge ?? false,
    tdsSection: body.tdsSection ?? null,
    lowerTdsRate: body.lowerTdsCertificate ? String(body.lowerTdsCertificate.rate) : null,
    lowerTdsValidTill: body.lowerTdsCertificate?.validTill ?? null,
    // Addresses aren't case-sensitive; one spelling keeps search and duplicates simple.
    email: body.email?.trim().toLowerCase() || null,
    phone: body.phone ?? null,
    currency: body.currency,
    ...addressTo('billing', body.billingAddress),
    ...addressTo('shipping', body.shippingAddress),
    creditLimitMinor: body.creditLimit?.minor ?? null,
    openingBalanceMinor: body.openingBalance.minor,
    openingBalanceDate: body.openingBalanceDate ?? null,
    openingBalanceSide: body.openingBalanceSide ?? null,
    paymentTermsDays: body.paymentTermsDays,
    notes: body.notes ?? null,
    status: body.status ?? 'active',
  };
}

/** A GSTIN carries the holder's PAN in characters 3 to 12. */
export function panFromGstin(gstin: string | null | undefined): string | null {
  const pan = gstin?.trim().toUpperCase().slice(2, 12);
  return pan && /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan) ? pan : null;
}
