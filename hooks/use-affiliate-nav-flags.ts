"use client";

import { useEffect, useState } from "react";
import { AFFILIATE_ADMIN_USERNAMES } from "@/lib/affiliate/shared";

/** Same Partner / Affiliate visibility as the profile sidebar, for the header dropdown. */
export function useAffiliateNavFlags(user: { name?: string | null } | null | undefined) {
  const [showPartners, setShowPartners] = useState(() =>
    AFFILIATE_ADMIN_USERNAMES.has(user?.name?.trim().toLowerCase() ?? ""),
  );
  const [showAffiliate, setShowAffiliate] = useState(false);

  useEffect(() => {
    if (!user) {
      setShowPartners(false);
      setShowAffiliate(false);
      return;
    }
    setShowPartners(AFFILIATE_ADMIN_USERNAMES.has(user.name?.trim().toLowerCase() ?? ""));
    let cancelled = false;
    void fetch("/api/affiliate/nav")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { showPartners?: boolean; showAffiliate?: boolean } | null) => {
        if (cancelled || !data) return;
        setShowPartners(Boolean(data.showPartners));
        setShowAffiliate(Boolean(data.showAffiliate));
      })
      .catch(() => {
        /* keep username fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [user?.name]);

  return { showPartners, showAffiliate };
}
