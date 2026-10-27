import type { Schema } from '@esmart/api-contract';
import { stateNameOf } from '@esmart/core/domain/stateCodes';
import type { GstinRecord } from '../gstin';

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Padded strings and `" "` placeholders read as absent. */
const text = (...values: unknown[]): string | undefined => {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return undefined;
};

const STATUS: Record<string, GstinRecord['status']> = { active: 'Active', cancelled: 'Cancelled', suspended: 'Suspended', inactive: 'Inactive' };

/** The register's `dty` ("Regular", "Composition", "Casual Taxable Person", …). */
function registrationTypeOf(raw: string | undefined): Schema<'GstRegistrationType'> {
  const v = (raw ?? '').toLowerCase();
  if (v.includes('composition')) return 'composition';
  if (v.includes('sez')) return 'sez';
  if (v.includes('overseas') || v.includes('non resident') || v.includes('oidar')) return 'overseas';
  return 'regular';
}

/** `dd/MM/yyyy` (the register) → ISO date. */
function isoDate(raw: string | undefined): string | undefined {
  const m = raw ? /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw) : null;
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
}

/**
 * The GST register's record for a GSTIN, as a `GstinRecord`.
 *
 * Both gateways pass the record on **as received**, and the register has two
 * spellings: GSTN's public search (`lgnm`, `tradeNam`, `pradr.addr`) and NIC's
 * "Get GSTIN details" (`LegalName`, `TradeName`, `AddrBno`…). Both are read;
 * whichever is present wins. The address is the principal place of business,
 * built from GSTN's pieces — building, floor, street — with the locality as
 * the city fallback. `registrationType`, `status` and `registeredOn` come from
 * `dty`, `sts` and `rgdt`.
 *
 * The mapping follows the register's published field names; the gateways'
 * sandboxes return the same shapes, but run it against a real response before
 * relying on a field that matters to you.
 */
export function toGstinRecord(raw: Rec, gstin: string): GstinRecord | null {
  const legalName = text(raw.lgnm, raw.LegalName, raw.legalName);
  if (!legalName) return null;

  const addr = isRec(raw.pradr) && isRec(raw.pradr.addr) ? raw.pradr.addr : {};
  const line1 = [text(addr.bno, raw.AddrBno), text(addr.flno, raw.AddrFlno), text(addr.bnm, raw.AddrBnm)].filter(Boolean).join(', ');
  const street = text(addr.st, raw.AddrSt);
  const locality = text(addr.loc, raw.AddrLoc);
  const city = text(addr.city, addr.dst, locality);
  const postalCode = text(addr.pncd, raw.AddrPncd);
  const stateCode = gstin.slice(0, 2);

  const address =
    (line1 || street || locality) && city && postalCode
      ? ({
          line1: line1 || street || locality!,
          ...(line1 && street ? { line2: street } : {}),
          city,
          state: stateNameOf(stateCode),
          stateCode,
          postalCode,
          country: 'IN',
        } as Schema<'Address'>)
      : undefined;

  const trade = text(raw.tradeNam, raw.TradeName, raw.tradeName);
  return {
    gstin,
    legalName,
    ...(trade ? { tradeName: trade } : {}),
    status: STATUS[(text(raw.sts, raw.Status, raw.status) ?? 'Active').toLowerCase()] ?? 'Active',
    registrationType: registrationTypeOf(text(raw.dty, raw.TaxpayerType)),
    ...(address ? { address } : {}),
    ...(isoDate(text(raw.rgdt)) ? { registeredOn: isoDate(text(raw.rgdt)) } : {}),
  };
}
