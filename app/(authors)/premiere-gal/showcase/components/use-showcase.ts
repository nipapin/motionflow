"use client";

import { useContext } from "react";
import { ShowcaseContext } from "./showcase-context";

export function useShowcase() {
  const ctx = useContext(ShowcaseContext);
  if (!ctx) throw new Error("useShowcase must be used within ShowcaseProvider");
  return ctx;
}
