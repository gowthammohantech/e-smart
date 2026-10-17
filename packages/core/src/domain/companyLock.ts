import { Company } from '../types';

/**
 * Once a business has posted entries, the parts of its profile that those
 * entries were computed from are frozen: the legal identity, the home state
 * (it decides CGST+SGST vs IGST), the financial year, and an existing tax
 * registration. An unregistered business may still register — that only adds
 * rules (HSN becomes mandatory) and never rewrites what was posted.
 */
export type ProfileLocks = {
  legalName: boolean;
  state: boolean;
  fiscalYear: boolean;
  /** The registered switch cannot be turned off. */
  registration: boolean;
  /** GSTIN and composition scheme are fixed. */
  taxIdentity: boolean;
};

export function profileLocks(company: Company | undefined, hasPostedEntries: boolean): ProfileLocks {
  const registered = !!company?.taxRegistration?.registered;
  return {
    legalName: hasPostedEntries,
    state: hasPostedEntries,
    fiscalYear: hasPostedEntries,
    registration: hasPostedEntries && registered,
    taxIdentity: hasPostedEntries && registered,
  };
}

/** Put the locked fields of `next` back to what `prev` had. */
export function applyProfileLocks(prev: Company, next: Company, hasPostedEntries: boolean): Company {
  const locks = profileLocks(prev, hasPostedEntries);
  const out: Company = { ...next, address: { ...next.address } };
  const prevReg = prev.taxRegistration;
  if (locks.legalName) out.legalName = prev.legalName;
  if (locks.fiscalYear) out.fiscalYearStartMonth = prev.fiscalYearStartMonth;
  if (locks.state) {
    out.address.state = prev.address.state;
    out.address.stateCode = prev.address.stateCode;
  }
  // Country and base currency are never editable after setup.
  out.country = prev.country;
  out.baseCurrency = prev.baseCurrency;
  if (out.taxRegistration) {
    out.taxRegistration = { ...out.taxRegistration };
    if (locks.state) out.taxRegistration.placeOfSupplyStateCode = prevReg?.placeOfSupplyStateCode;
    if (locks.registration) out.taxRegistration.registered = true;
    if (locks.taxIdentity) {
      out.taxRegistration.identifier = prevReg?.identifier;
      out.taxRegistration.compositionScheme = prevReg?.compositionScheme;
    }
  }
  return out;
}
