/** The checks the e-way bill portal runs, with its own error codes. */

import { EwbPartA, EwbPartB, IrpError } from '@/types';
import { isValidGstin, isValidTransporterId } from '../gstin';
import { isValidStateCode } from '../stateCodes';
import { isValidVehicleNumber } from './vehicle';

export const EWB_ERRORS: Record<string, string> = {
  '102': 'Transporter ID is not a valid GSTIN or TRANSIN',
  '104': 'Distance cannot exceed 4,000 km',
  '112': 'Vehicle number is required when the goods move by road',
  '238': 'Vehicle number is not valid',
  '325': 'The e-way bill has expired and can no longer be updated',
  '378': 'An e-way bill cannot be cancelled more than 24 hours after generation',
  '604': 'Supplier GSTIN is not valid',
  '605': 'PIN code must be six digits',
  '606': 'State code is not valid',
  '673': 'Transport document number is required for rail, air or ship',
};

export const MAX_DISTANCE_KM = 4000;

function err(code: string, override?: string): IrpError {
  return { code, message: override ?? EWB_ERRORS[code] ?? 'Rejected by the portal' };
}

export function validateEwb(args: {
  partA: EwbPartA;
  partB: EwbPartB;
  distanceKm: number;
}): IrpError[] {
  const { partA, partB, distanceKm } = args;
  const errors: IrpError[] = [];

  if (!isValidGstin(partA.fromGstin)) errors.push(err('604'));
  if (!/^\d{6}$/.test(partA.fromPincode) || !/^\d{6}$/.test(partA.toPincode)) errors.push(err('605'));
  if (!isValidStateCode(partA.fromStateCode) || !isValidStateCode(partA.toStateCode)) {
    errors.push(err('606'));
  }

  if (distanceKm > MAX_DISTANCE_KM) errors.push(err('104'));

  if (partB.transporterId && !isValidTransporterId(partB.transporterId)) errors.push(err('102'));

  if (partB.transMode === '1') {
    if (!partB.vehicleNo) errors.push(err('112'));
    else if (!isValidVehicleNumber(partB.vehicleNo)) errors.push(err('238'));
  } else if (!partB.transDocNo) {
    errors.push(err('673'));
  }

  return errors;
}
