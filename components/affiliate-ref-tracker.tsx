"use client";

import { useEffect } from "react";
import {
  AFFILIATE_REF_QUERY_PARAM,
  normalizeAffiliateSlug,
} from "@/lib/affiliate/shared";

/**
 * Reports a referral-link visit once per browser session. The cookie itself is
 * written by `proxy.ts`; this only feeds the partner's click stats and lets the
 * server verify the slug. Reads `location.search` directly so the root layout
 * does not need a `useSearchParams` Suspense boundary.
 */
export function AffiliateRefTracker() {
  useEffect(() => {
    const slug = normalizeAffiliateSlug(
      new URLSearchParams(window.location.search).get(AFFILIATE_REF_QUERY_PARAM),
    );
    if (!slug) return;

    const storageKey = `mf_aff_hit:${slug}`;
    try {
      if (window.sessionStorage.getItem(storageKey)) return;
      window.sessionStorage.setItem(storageKey, "1");
    } catch {
      /* private mode: count the visit anyway */
    }

    void fetch("/api/affiliate/hit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
      keepalive: true,
    }).catch(() => {
      /* stats are best-effort */
    });
  }, []);

  return null;
}
