import "server-only";

import type { SessionUser } from "@/lib/auth/get-session-user";
import { AFFILIATE_ADMIN_USERNAMES } from "@/lib/affiliate/shared";

/**
 * Who can manage partners. Same shape as `packagesAdminEmails()` — a default
 * plus a comma-separated `AFFILIATE_ADMIN_EMAILS` env list — except the default
 * is a username, because `users.name` is the public login name on this site.
 */
export function affiliateAdminEmails(): Set<string> {
  const set = new Set<string>();
  const fromEnv = process.env.AFFILIATE_ADMIN_EMAILS?.trim();
  if (fromEnv) {
    for (const part of fromEnv.split(",")) {
      const email = part.trim().toLowerCase();
      if (email) set.add(email);
    }
  }
  return set;
}

export function isAffiliateAdmin(
  user: Pick<SessionUser, "email" | "name"> | null | undefined,
): boolean {
  if (!user) return false;
  if (AFFILIATE_ADMIN_USERNAMES.has(user.name?.trim().toLowerCase() ?? "")) return true;
  const email = user.email?.trim().toLowerCase();
  return Boolean(email) && affiliateAdminEmails().has(email);
}
