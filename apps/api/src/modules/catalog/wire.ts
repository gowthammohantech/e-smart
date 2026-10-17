import type { Schema } from '@esmart/api-contract';
import { isLowStock } from '@esmart/core/domain/stockLedger';
import type { Item } from '@esmart/core/types';
import type { schema } from '@esmart/db';
import { compact, money, versioned } from '../../lib/wire';

type ItemRow = typeof schema.items.$inferSelect;

/** `imageUri` is a short-lived signed URL, so the caller resolves it. */
export function itemToWire(row: ItemRow, imageUri?: string): Schema<'Item'> {
  const currency = row.currency.trim();
  return compact({
    id: row.id,
    companyId: row.companyId,
    sku: row.sku,
    name: row.name,
    description: row.description,
    type: row.type,
    unit: row.unit,
    salePrice: money(row.salePriceMinor, currency),
    purchasePrice: money(row.purchasePriceMinor, currency),
    taxCategoryId: row.taxCategoryId,
    hsnCode: row.hsnCode,
    barcode: row.barcode,
    trackInventory: row.trackInventory,
    openingStock: Number(row.openingStock),
    reorderLevel: Number(row.reorderLevel),
    imageUri,
    status: row.status,
    ...versioned(row),
  });
}

/** Low follows core: tracked, with a reorder level, and at or under it. */
export function itemWithStock(row: ItemRow, onHand: number, imageUri?: string): Schema<'ItemWithStock'> {
  const low = isLowStock({ trackInventory: row.trackInventory, reorderLevel: Number(row.reorderLevel) } as Item, onHand);
  return { ...itemToWire(row, imageUri), stockOnHand: onHand, low };
}

/** Columns from an Item body. Opening stock is written on create only. */
export function itemColumns(body: Schema<'Item'>, currency: string) {
  return {
    sku: body.sku.trim(),
    name: body.name.trim(),
    description: body.description ?? null,
    type: body.type,
    unit: body.unit.trim().toUpperCase(),
    currency,
    salePriceMinor: body.salePrice.minor,
    purchasePriceMinor: body.purchasePrice.minor,
    taxCategoryId: body.taxCategoryId,
    barcode: body.barcode?.trim() || null,
    trackInventory: body.trackInventory ?? body.type === 'goods',
    reorderLevel: String(body.reorderLevel ?? 0),
    status: body.status ?? 'active',
  };
}
