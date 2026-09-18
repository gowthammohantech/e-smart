/**
 * How long an e-way bill stays valid.
 *
 * One day per 200 km or part thereof for regular cargo, one day per 20 km for
 * over-dimensional cargo, and never less than a day. Validity runs to midnight
 * at the end of the final day, which is why a 150 km trip generated at 11pm
 * still expires the following midnight rather than 24 hours later.
 */

export type CargoType = 'regular' | 'odc';

export const KM_PER_DAY: Record<CargoType, number> = { regular: 200, odc: 20 };

export function validityDays(distanceKm: number, cargo: CargoType = 'regular'): number {
  const perDay = KM_PER_DAY[cargo];
  return Math.max(1, Math.ceil(Math.max(distanceKm, 0) / perDay));
}

/** ISO timestamp of midnight at the end of the last valid day. */
export function validUpto(
  generatedAt: string,
  distanceKm: number,
  cargo: CargoType = 'regular',
): string {
  const days = validityDays(distanceKm, cargo);
  const start = new Date(generatedAt);
  const end = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + days, 0, 0, 0),
  );
  return end.toISOString();
}

export function isExpired(validUptoIso: string | undefined, nowIso: string): boolean {
  if (!validUptoIso) return false;
  return Date.parse(nowIso) >= Date.parse(validUptoIso);
}

export function remainingHours(validUptoIso: string | undefined, nowIso: string): number {
  if (!validUptoIso) return 0;
  return Math.max(0, (Date.parse(validUptoIso) - Date.parse(nowIso)) / 3_600_000);
}

/** Validity can be extended from eight hours before expiry to eight hours after. */
export function canExtend(validUptoIso: string | undefined, nowIso: string): boolean {
  if (!validUptoIso) return false;
  const delta = (Date.parse(nowIso) - Date.parse(validUptoIso)) / 3_600_000;
  return delta >= -8 && delta <= 8;
}
