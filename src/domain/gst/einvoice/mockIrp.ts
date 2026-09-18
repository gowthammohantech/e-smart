/**
 * A local stand-in for the Invoice Registration Portal.
 *
 * It validates, mints and cancels exactly as the real portal does, including
 * the duplicate-IRN rule and the 24-hour cancellation window. What it does not
 * do is leave the device.
 *
 * The registry of live IRNs is passed in on every call rather than held in
 * this module. The documents survive a reload from AsyncStorage; a module-level
 * Map would not, and the duplicate rule would quietly stop working the first
 * time the app was restarted.
 */

import { IrpError } from '@/types';
import { sha256Hex } from '@/lib/sha256';
import { EInvoicePayload } from './schema';
import { generateIrn } from './irn';
import { QrPayload, buildQrPayload, signJws, signQr } from './qr';
import { EINVOICE_ERRORS, validateEInvoice } from './validate';

export type IrpAckRecord = {
  /** ISO timestamp of the acknowledgement, used for the cancellation window. */
  ackDate: string;
  documentId: string;
  cancelled?: boolean;
};

export type MockIrpOptions = {
  /** Injected clock, so seeds and tests are reproducible. */
  now: () => Date;
  /** Live IRNs, rebuilt from the documents on every call. */
  activeIrns: Map<string, IrpAckRecord>;
  secret?: string;
  /** Force a failure, for exercising the error path from the UI. */
  behaviour?: 'success' | 'alwaysFail';
  forcedErrorCode?: string;
};

export type IrpGenerateSuccess = {
  ok: true;
  irn: string;
  ackNo: string;
  ackDate: string;
  signedInvoice: string;
  signedQrCode: string;
  qrPayload: QrPayload;
};

export type IrpFailure = { ok: false; errors: IrpError[] };

export type IrpCancelSuccess = { ok: true; irn: string; cancelledAt: string };

export const CANCEL_REASONS: { code: '1' | '2' | '3' | '4'; label: string }[] = [
  { code: '1', label: 'Duplicate' },
  { code: '2', label: 'Data entry mistake' },
  { code: '3', label: 'Order cancelled' },
  { code: '4', label: 'Others' },
];

/** The window the portal allows for cancelling an IRN. */
export const CANCEL_WINDOW_HOURS = 24;

function isoTimestamp(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

/** 15 digits, derived from the IRN so the same document always acks the same. */
function ackNumberFor(irn: string): string {
  const digits = sha256Hex(`ack:${irn}`).replace(/\D/g, '');
  return (digits + '000000000000000').slice(0, 15);
}

export function createMockIrp(opts: MockIrpOptions) {
  const secret = opts.secret;

  return {
    generate(args: {
      payload: EInvoicePayload;
      documentId: string;
    }): IrpGenerateSuccess | IrpFailure {
      const { payload, documentId } = args;
      const now = opts.now();
      const today = now.toISOString().slice(0, 10);

      if (opts.behaviour === 'alwaysFail') {
        const code = opts.forcedErrorCode ?? '3029';
        return { ok: false, errors: [{ code, message: EINVOICE_ERRORS[code] ?? 'Rejected' }] };
      }

      const errors = validateEInvoice(payload, { today });
      if (errors.length > 0) return { ok: false, errors };

      const irn = generateIrn({
        supplierGstin: payload.SellerDtls.Gstin,
        docType: payload.DocDtls.Typ,
        docNo: payload.DocDtls.No,
        date: isoOf(payload.DocDtls.Dt),
      });

      // The portal rejects a second registration of the same document, and
      // says which IRN already holds it.
      const existing = opts.activeIrns.get(irn);
      if (existing && !existing.cancelled) {
        return {
          ok: false,
          errors: [
            { code: '2150', message: `${EINVOICE_ERRORS['2150']} (IRN ${irn.slice(0, 12)}…)` },
          ],
        };
      }
      void documentId;

      const ackDate = isoTimestamp(now);
      const qrPayload = buildQrPayload(payload, irn, ackDate);

      return {
        ok: true,
        irn,
        ackNo: ackNumberFor(irn),
        ackDate,
        signedInvoice: signJws(JSON.stringify(payload), secret),
        signedQrCode: signQr(qrPayload, secret),
        qrPayload,
      };
    },

    cancel(args: {
      irn: string;
      reasonCode: '1' | '2' | '3' | '4';
      remarks?: string;
    }): IrpCancelSuccess | IrpFailure {
      const record = opts.activeIrns.get(args.irn);
      if (!record) {
        return { ok: false, errors: [{ code: '9999', message: 'No such IRN on the portal' }] };
      }
      if (record.cancelled) {
        return { ok: false, errors: [{ code: '9999', message: 'This IRN is already cancelled' }] };
      }
      if (args.reasonCode === '4' && !args.remarks?.trim()) {
        return {
          ok: false,
          errors: [{ code: '9998', message: 'Remarks are required when the reason is "Others"' }],
        };
      }

      const now = opts.now();
      const ackedAt = Date.parse(record.ackDate.replace(' ', 'T') + 'Z');
      const hours = (now.getTime() - ackedAt) / 3_600_000;
      if (hours > CANCEL_WINDOW_HOURS) {
        return { ok: false, errors: [{ code: '2270', message: EINVOICE_ERRORS['2270'] }] };
      }

      return { ok: true, irn: args.irn, cancelledAt: isoTimestamp(now) };
    },
  };
}

function isoOf(nic: string): string {
  const [d, m, y] = nic.split('/');
  return `${y}-${m}-${d}`;
}
