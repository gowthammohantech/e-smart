import type { Config } from '../config';

/**
 * GST e-invoice (IRP) and e-way bill (EWB) portals. The simulator reuses @esmart/core/domain/irpAdapter; production talks to a GSP.
 *
 * Owned by the Compliance module; shape it to what its handlers need.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ComplianceProvider {}

export function createComplianceProvider(_config: Config): ComplianceProvider {
  return {};
}
