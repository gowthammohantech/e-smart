/** Vehicle registration numbers, as the e-way bill portal accepts them. */

export const VEHICLE_RE = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/;

export function normalizeVehicleNumber(raw: string | undefined): string {
  return (raw ?? '').replace(/[\s-]/g, '').toUpperCase();
}

export function isValidVehicleNumber(raw: string | undefined): boolean {
  return VEHICLE_RE.test(normalizeVehicleNumber(raw));
}

/** MH12AB1234 reads more easily as MH 12 AB 1234. */
export function formatVehicleNumber(raw: string | undefined): string {
  const v = normalizeVehicleNumber(raw);
  const match = v.match(/^([A-Z]{2})([0-9]{1,2})([A-Z]{0,3})([0-9]{4})$/);
  if (!match) return v;
  return [match[1], match[2], match[3], match[4]].filter(Boolean).join(' ');
}

export const TRANSPORT_MODE_LABELS: Record<string, string> = {
  '1': 'Road',
  '2': 'Rail',
  '3': 'Air',
  '4': 'Ship',
};
