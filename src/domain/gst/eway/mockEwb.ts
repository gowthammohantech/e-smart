/**
 * A local stand-in for the NIC e-way bill portal.
 *
 * Like the IRP mock, the register of live bills is handed in on each call so
 * that it always reflects the documents rather than a separate memory that a
 * reload would wipe.
 */

import { EwbPartA, EwbPartB, IrpError } from '@/types';
import { sha256Hex } from '@/lib/sha256';
import { CargoType, canExtend, isExpired, validUpto } from './validity';
import { EWB_ERRORS, validateEwb } from './validate';

export type EwbRecord = {
  ewbDate: string;
  validUpto: string;
  documentId: string;
  cancelled?: boolean;
};

export type MockEwbOptions = {
  now: () => Date;
  activeBills: Map<string, EwbRecord>;
  behaviour?: 'success' | 'alwaysFail';
  forcedErrorCode?: string;
};

export type EwbGenerateSuccess = {
  ok: true;
  ewbNo: string;
  ewbDate: string;
  validUpto: string;
};

export type EwbFailure = { ok: false; errors: IrpError[] };

export const EWB_CANCEL_WINDOW_HOURS = 24;

export const EWB_CANCEL_REASONS: { code: string; label: string }[] = [
  { code: '1', label: 'Duplicate' },
  { code: '2', label: 'Order cancelled' },
  { code: '3', label: 'Data entry mistake' },
  { code: '4', label: 'Others' },
];

/** 12 digits, derived from the document so a regeneration is recognisable. */
function ewbNumberFor(partA: EwbPartA): string {
  const digits = sha256Hex(`ewb:${partA.fromGstin}:${partA.docNo}:${partA.docDate}`).replace(/\D/g, '');
  return (digits + '000000000000').slice(0, 12);
}

export function createMockEwb(opts: MockEwbOptions) {
  return {
    generate(args: {
      partA: EwbPartA;
      partB: EwbPartB;
      distanceKm: number;
      cargo: CargoType;
      documentId: string;
    }): EwbGenerateSuccess | EwbFailure {
      if (opts.behaviour === 'alwaysFail') {
        const code = opts.forcedErrorCode ?? '238';
        return { ok: false, errors: [{ code, message: EWB_ERRORS[code] ?? 'Rejected' }] };
      }

      const errors = validateEwb(args);
      if (errors.length > 0) return { ok: false, errors };

      const ewbNo = ewbNumberFor(args.partA);
      const existing = opts.activeBills.get(ewbNo);
      if (existing && !existing.cancelled) {
        return {
          ok: false,
          errors: [{ code: '311', message: `An active e-way bill (${ewbNo}) already covers this document` }],
        };
      }

      const now = opts.now().toISOString();
      return {
        ok: true,
        ewbNo,
        ewbDate: now,
        validUpto: validUpto(now, args.distanceKm, args.cargo),
      };
    },

    updateVehicle(args: { ewbNo: string; partB: EwbPartB }): { ok: true } | EwbFailure {
      const record = opts.activeBills.get(args.ewbNo);
      const now = opts.now().toISOString();
      if (!record || record.cancelled) {
        return { ok: false, errors: [{ code: '325', message: 'No active e-way bill with that number' }] };
      }
      if (isExpired(record.validUpto, now)) {
        return { ok: false, errors: [{ code: '325', message: EWB_ERRORS['325'] }] };
      }
      if (args.partB.transMode === '1' && !args.partB.vehicleNo) {
        return { ok: false, errors: [{ code: '112', message: EWB_ERRORS['112'] }] };
      }
      return { ok: true };
    },

    extend(args: {
      ewbNo: string;
      remainingDistanceKm: number;
      cargo: CargoType;
    }): { ok: true; validUpto: string } | EwbFailure {
      const record = opts.activeBills.get(args.ewbNo);
      const now = opts.now().toISOString();
      if (!record || record.cancelled) {
        return { ok: false, errors: [{ code: '325', message: 'No active e-way bill with that number' }] };
      }
      if (!canExtend(record.validUpto, now)) {
        return {
          ok: false,
          errors: [
            {
              code: '325',
              message: 'Validity can only be extended within eight hours either side of expiry',
            },
          ],
        };
      }
      return { ok: true, validUpto: validUpto(now, args.remainingDistanceKm, args.cargo) };
    },

    cancel(args: { ewbNo: string; reason: string }): { ok: true; cancelledAt: string } | EwbFailure {
      const record = opts.activeBills.get(args.ewbNo);
      if (!record || record.cancelled) {
        return { ok: false, errors: [{ code: '325', message: 'No active e-way bill with that number' }] };
      }
      const now = opts.now();
      const hours = (now.getTime() - Date.parse(record.ewbDate)) / 3_600_000;
      if (hours > EWB_CANCEL_WINDOW_HOURS) {
        return { ok: false, errors: [{ code: '378', message: EWB_ERRORS['378'] }] };
      }
      void args.reason;
      return { ok: true, cancelledAt: now.toISOString() };
    },
  };
}
