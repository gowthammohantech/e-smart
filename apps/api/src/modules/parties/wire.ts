import type { Schema } from '@esmart/api-contract';
import type { schema } from '@esmart/db';
import type { PartyBalance } from '../../lib/balances';
import { addressFrom, addressTo, compact, maybeMoney, money, versioned } from '../../lib/wire';

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
    email: row.email,
    phone: row.phone,
    currency,
    billingAddress: addressFrom(row, 'billing')!,
    shippingAddress: addressFrom(row, 'shipping'),
    creditLimit: maybeMoney(row.creditLimitMinor, currency),
    openingBalance: money(row.openingBalanceMinor, currency),
    paymentTermsDays: row.paymentTermsDays,
    notes: row.notes,
    status: row.status,
    ...versioned(row),
  });
}

export function partyWithBalance(row: PartyRow, balance: PartyBalance | undefined): Schema<'PartyWithBalance'> {
  const currency = row.currency.trim();
  return {
    ...partyToWire(row),
    outstanding: money(balance?.outstanding ?? 0, currency),
    overdue: money(balance?.overdue ?? 0, currency),
    advance: money(balance?.advance ?? 0, currency),
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
    email: body.email ?? null,
    phone: body.phone ?? null,
    currency: body.currency,
    ...addressTo('billing', body.billingAddress),
    ...addressTo('shipping', body.shippingAddress),
    creditLimitMinor: body.creditLimit?.minor ?? null,
    openingBalanceMinor: body.openingBalance.minor,
    paymentTermsDays: body.paymentTermsDays,
    notes: body.notes ?? null,
    status: body.status ?? 'active',
  };
}
