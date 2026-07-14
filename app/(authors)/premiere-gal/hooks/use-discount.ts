"use client";

import { usePageSets } from "../page-sets-context";

/** Port of `resources/js/premieregal/hooks/useDiscount.jsx`. */
export function useDiscount(): boolean {
  const pageSets = usePageSets();
  if (pageSets.had_toolkit_max === true && pageSets.is_beta_tester !== true) {
    return false;
  }
  return pageSets.discount_id !== null;
}
