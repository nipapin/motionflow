"use client";

import { useEffect } from "react";
import {
  AFFILIATE_REF_QUERY_PARAM,
  normalizeAffiliateRef,
} from "@/lib/affiliate/shared";

/**
 * Reports a referral-link visit once per browser session. The cookie itself is
 * written by `proxy.ts`; this only feeds the partner's click stats and lets the
 * server verify the slug. Sends `document.referrer` because the request Referer
 * on the API call is this site, not the page that sent the visitor.
 */
export function AffiliateRefTracker() {
  useEffect(() => {
    const ref = normalizeAffiliateRef(
      new URLSearchParams(window.location.search).get(AFFILIATE_REF_QUERY_PARAM),
    );
    if (!ref) return;

    const storageKey = `mf_aff_hit:${ref}`;
    try {
      if (window.sessionStorage.getItem(storageKey)) return;
      window.sessionStorage.setItem(storageKey, "1");
    } catch {
      /* private mode: count the visit anyway */
    }

    void fetch("/api/affiliate/hit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ref,
        referrer: document.referrer || null,
      }),
      keepalive: true,
    }).catch(() => {
      /* stats are best-effort */
    });
  }, []);

  return null;
}
