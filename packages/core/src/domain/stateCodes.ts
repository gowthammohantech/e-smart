/**
 * GST state codes — the first two digits of every GSTIN, and the input to the
 * intra-state / inter-state decision that splits tax into CGST+SGST or IGST.
 */

export type GstState = { code: string; name: string; alpha: string };

export const GST_STATE_CODES: GstState[] = [
  { code: '01', name: 'Jammu and Kashmir', alpha: 'JK' },
  { code: '02', name: 'Himachal Pradesh', alpha: 'HP' },
  { code: '03', name: 'Punjab', alpha: 'PB' },
  { code: '04', name: 'Chandigarh', alpha: 'CH' },
  { code: '05', name: 'Uttarakhand', alpha: 'UK' },
  { code: '06', name: 'Haryana', alpha: 'HR' },
  { code: '07', name: 'Delhi', alpha: 'DL' },
  { code: '08', name: 'Rajasthan', alpha: 'RJ' },
  { code: '09', name: 'Uttar Pradesh', alpha: 'UP' },
  { code: '10', name: 'Bihar', alpha: 'BR' },
  { code: '11', name: 'Sikkim', alpha: 'SK' },
  { code: '12', name: 'Arunachal Pradesh', alpha: 'AR' },
  { code: '13', name: 'Nagaland', alpha: 'NL' },
  { code: '14', name: 'Manipur', alpha: 'MN' },
  { code: '15', name: 'Mizoram', alpha: 'MZ' },
  { code: '16', name: 'Tripura', alpha: 'TR' },
  { code: '17', name: 'Meghalaya', alpha: 'ML' },
  { code: '18', name: 'Assam', alpha: 'AS' },
  { code: '19', name: 'West Bengal', alpha: 'WB' },
  { code: '20', name: 'Jharkhand', alpha: 'JH' },
  { code: '21', name: 'Odisha', alpha: 'OD' },
  { code: '22', name: 'Chhattisgarh', alpha: 'CG' },
  { code: '23', name: 'Madhya Pradesh', alpha: 'MP' },
  { code: '24', name: 'Gujarat', alpha: 'GJ' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu', alpha: 'DH' },
  { code: '27', name: 'Maharashtra', alpha: 'MH' },
  { code: '29', name: 'Karnataka', alpha: 'KA' },
  { code: '30', name: 'Goa', alpha: 'GA' },
  { code: '31', name: 'Lakshadweep', alpha: 'LD' },
  { code: '32', name: 'Kerala', alpha: 'KL' },
  { code: '33', name: 'Tamil Nadu', alpha: 'TN' },
  { code: '34', name: 'Puducherry', alpha: 'PY' },
  { code: '35', name: 'Andaman and Nicobar Islands', alpha: 'AN' },
  { code: '36', name: 'Telangana', alpha: 'TS' },
  { code: '37', name: 'Andhra Pradesh', alpha: 'AP' },
  { code: '38', name: 'Ladakh', alpha: 'LA' },
  { code: '97', name: 'Other Territory', alpha: 'OT' },
];

/** Place-of-supply code used on an export invoice. */
export const OTHER_COUNTRY_CODE = '96';

export function stateNameOf(code?: string): string {
  if (code === OTHER_COUNTRY_CODE) return 'Other country';
  return GST_STATE_CODES.find((s) => s.code === code)?.name ?? '—';
}

export function stateByCode(code?: string): GstState | undefined {
  return GST_STATE_CODES.find((s) => s.code === code);
}

export function isValidStateCode(code?: string): boolean {
  if (!code) return false;
  if (code === OTHER_COUNTRY_CODE) return true;
  return GST_STATE_CODES.some((s) => s.code === code);
}
