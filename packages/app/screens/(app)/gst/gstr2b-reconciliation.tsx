import React from 'react';
import { Gstr2bView } from './gstr2b';

/** 2B reconciliation: the period's GSTR-2B line by line against the purchase register, to settle and claim. */
export default function Gstr2bReconciliationScreen() {
  return <Gstr2bView mode="reconcile" />;
}
