"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PremiereGalPageSets } from "@/lib/premiere-gal-discount";

const PageSetsContext = createContext<PremiereGalPageSets>({
  discount_id: null,
  discount_percent: null,
  is_beta_tester: false,
  had_toolkit_max: false,
});

export function PageSetsProvider({
  value,
  children,
}: {
  value: PremiereGalPageSets;
  children: ReactNode;
}) {
  return <PageSetsContext.Provider value={value}>{children}</PageSetsContext.Provider>;
}

export function usePageSets(): PremiereGalPageSets {
  return useContext(PageSetsContext);
}
