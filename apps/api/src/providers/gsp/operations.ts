/**
 * What a GSP call does, in words, for the third-party call log. The gateways' routes read like
 * `/enriched/ei/api/invoice` or `/einvoice/type/GENERATE/version/V1_03`; an operator looking at a
 * failed call wants "Generate e-invoice (IRN)". Order matters: the first match wins, and the longer
 * route comes before the shorter one it starts with.
 */
const OPERATIONS: [RegExp, string][] = [
  [/\/authenticate\b/, 'Authenticate with the gateway'],
  [/\/commonapi\/search|\/public\/search/, 'GSTIN lookup (taxpayer search)'],
  [/GSTNDETAILS/, 'GSTIN details'],
  [/irnbydocdetails/, 'Look up IRN by document'],
  [/\/ei\/api\/invoice\/cancel|type\/CANCEL\//, 'Cancel e-invoice (IRN)'],
  [/\/ei\/api\/invoice\/irn\b/, 'Get IRN details'],
  [/\/ei\/api\/ewaybill|GENERATE_EWAYBILL/, 'Generate e-way bill from IRN'],
  [/\/ei\/api\/invoice$|type\/GENERATE\//, 'Generate e-invoice (IRN)'],
  [/GetEwayBillGeneratedByConsigner/, 'Look up e-way bill by document'],
  [/genewaybill/, 'Generate e-way bill'],
  [/vehewb/, 'Update vehicle on e-way bill (Part B)'],
  [/extendvalidity/, 'Extend e-way bill validity'],
  [/canewb/, 'Cancel e-way bill'],
  [/returns\/gstr2b/, 'GSTR-2B'],
  [/returns\/gstr1/, 'GSTR-1'],
  [/returns\/gstr3b/, 'GSTR-3B'],
  [/\/ledgers/, 'Electronic ledgers'],
  [/\/returns$/, 'Returns status'],
];

export function describeGspOperation(path: string, query?: Readonly<Record<string, string>>): string {
  const found = OPERATIONS.find(([pattern]) => pattern.test(path));
  if (found) return found[1];
  // Adaequare's e-way bill route is one path with the verb in `action`.
  if (/\/ewayapi$/.test(path) && query?.action) return `E-way bill: ${query.action}`;
  if (/\/ewayapi$/.test(path)) return 'E-way bill';
  return path;
}
