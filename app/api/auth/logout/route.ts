import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  LARAVEL_COOKIE_NAME,
  baseCookieOptions,
  sharedCookieDomain,
} from "@/lib/auth/session";
import {
  decryptLaravelCookie,
  deleteLaravelSession,
} from "@/lib/auth/laravel-session";

export async function POST(req: NextRequest) {
  const laravelCookie = req.cookies.get(LARAVEL_COOKIE_NAME)?.value;
  if (laravelCookie) {
    const sessionId = decryptLaravelCookie(laravelCookie);
    if (sessionId) await deleteLaravelSession(sessionId);
  }

  const res = NextResponse.json({ success: true as const });

  // Clear cookies in every scope they could have been set under.
  // A cookie is only removed if the Set-Cookie used to remove it has the
  // same Domain attribute, so we emit one Set-Cookie per scope:
  //   1. host-only (no Domain)        — used by older Next.js logins
  //   2. shared domain (.motionflow.com) — used by Laravel and current Next.js logins
  const baseClear = { ...baseCookieOptions(), maxAge: 0 };
  const hostOnlyClear = { ...baseClear };
  delete (hostOnlyClear as { domain?: string }).domain;

  for (const name of [SESSION_COOKIE_NAME, LARAVEL_COOKIE_NAME]) {
    res.cookies.set(name, "", hostOnlyClear);
    const domain = sharedCookieDomain();
    if (domain) {
      res.cookies.set(name, "", { ...baseClear, domain });
    }
  }

  return res;
}
