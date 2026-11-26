"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PremiereGalPageSets } from "@/lib/premiere-gal-discount";

type PageSetsValue = PremiereGalPageSets & { initialTime: number };

const PageSetsContext = createContext<PageSetsValue>({
  discount_id: null,
  discount_percent: null,
  is_beta_tester: false,
  had_toolkit_max: false,
  has_qualifying_purchase: false,
  initialTime: 0,
});

export function PageSetsProvider({
  value,
  children,
}: {
  value: PageSetsValue;
  children: ReactNode;
}) {
  return <PageSetsContext.Provider value={value}>{children}</PageSetsContext.Provider>;
}

export function usePageSets(): PageSetsValue {
  return useContext(PageSetsContext);
}
