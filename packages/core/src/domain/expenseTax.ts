import { Money, add, allocate, subtract, zero } from '../lib/money';
import { Branch, Company, Expense, TaxComponent } from '../types';
import { homeStateCode } from './taxEngine';

type ExpenseTax = Pick<Expense, 'amount' | 'taxAmount' | 'itcEligibility' | 'reverseCharge'>;

/** The GST on an expense the business can claim back as input tax credit. */
export function claimableTax(e: ExpenseTax): Money {
  return (e.itcEligibility ?? 'eligible') === 'eligible' ? e.taxAmount : zero(e.taxAmount.currency);
}

/**
 * What an expense costs the business: what it paid, plus reverse-charge tax it paid the
 * government on top, less the credit it can claim. Blocked or ineligible tax is part of the cost.
 */
export function expenseCost(e: ExpenseTax): Money {
  const paid = e.reverseCharge ? add(e.amount, e.taxAmount) : e.amount;
  return subtract(paid, claimableTax(e));
}

/**
 * An expense's GST as CGST + SGST or IGST. Inter-state when the supplier's GSTIN (or the place
 * of supply) is in another state from the one the business receives it in.
 */
export function expenseTaxComponents(
  e: Pick<Expense, 'taxAmount' | 'placeOfSupplyStateCode' | 'supplierGstin'>,
  rate: number,
  company: Company | undefined,
  branch?: Branch,
): TaxComponent[] {
  if (!(e.taxAmount.minor > 0)) return [];
  const home = homeStateCode(company, branch);
  const pos = e.placeOfSupplyStateCode ?? home;
  const supplierState = e.supplierGstin?.slice(0, 2);
  const interState = (!!supplierState && supplierState !== pos) || (!!home && !!pos && home !== pos);
  if (interState) return [{ type: 'IGST', label: `IGST ${rate}%`, rate, amount: e.taxAmount }];
  const [cgst, sgst] = allocate(e.taxAmount, [1, 1]);
  return [
    { type: 'CGST', label: `CGST ${rate / 2}%`, rate: rate / 2, amount: cgst },
    { type: 'SGST', label: `SGST ${rate / 2}%`, rate: rate / 2, amount: sgst },
  ];
}
