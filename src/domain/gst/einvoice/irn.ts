/**
 * The Invoice Reference Number.
 *
 * The IRP derives it from four facts that are unique to a document — supplier
 * GSTIN, document type, document number and financial year — so the same
 * invoice always hashes to the same IRN. That determinism is the whole point:
 * it is how the portal recognises a duplicate submission.
 */

import { sha256Hex } from '@/lib/sha256';
import { normalizeGstin } from '../gstin';
import { EInvoiceDocType } from './schema';

/** Indian financial year label for a date, e.g. '2026-27'. April starts the year. */
export function financialYearLabel(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export function irnSource(
  supplierGstin: string,
  docType: EInvoiceDocType,
  docNo: string,
  fy: string,
): string {
  return `${normalizeGstin(supplierGstin)}-${docType}-${docNo}-${fy}`;
}

export function generateIrn(args: {
  supplierGstin: string;
  docType: EInvoiceDocType;
  docNo: string;
  date: string;
}): string {
  return sha256Hex(
    irnSource(args.supplierGstin, args.docType, args.docNo, financialYearLabel(args.date)),
  );
}

export function isWellFormedIrn(irn: string | undefined): boolean {
  return !!irn && /^[0-9a-f]{64}$/.test(irn);
}
