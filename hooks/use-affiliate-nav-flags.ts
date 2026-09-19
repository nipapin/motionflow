"use client";

import { useEffect, useState } from "react";
import { AFFILIATE_ADMIN_USERNAMES } from "@/lib/affiliate/shared";

/** Same Partner / Affiliate visibility as the profile sidebar, for the header dropdown. */
export function useAffiliateNavFlags(user: { name?: string | null } | null | undefined) {
  const adminByName = AFFILIATE_ADMIN_USERNAMES.has(user?.name?.trim().toLowerCase() ?? "");
  const [showPartners, setShowPartners] = useState(adminByName);
  const [showUsers, setShowUsers] = useState(adminByName);
  const [showAffiliate, setShowAffiliate] = useState(false);

  useEffect(() => {
    if (!user) {
      setShowPartners(false);
      setShowUsers(false);
      setShowAffiliate(false);
      return;
    }
    const nextAdmin = AFFILIATE_ADMIN_USERNAMES.has(user.name?.trim().toLowerCase() ?? "");
    setShowPartners(nextAdmin);
    setShowUsers(nextAdmin);
    let cancelled = false;
    void fetch("/api/affiliate/nav")
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            showPartners?: boolean;
            showUsers?: boolean;
            showAffiliate?: boolean;
          } | null,
        ) => {
          if (cancelled || !data) return;
          setShowPartners(Boolean(data.showPartners));
          setShowUsers(
            data.showUsers !== undefined
              ? Boolean(data.showUsers)
              : Boolean(data.showPartners),
          );
          setShowAffiliate(Boolean(data.showAffiliate));
        },
      )
      .catch(() => {
        /* keep username fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [user?.name]);

  return { showPartners, showUsers, showAffiliate };
}
