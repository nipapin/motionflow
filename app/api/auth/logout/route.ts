import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  LARAVEL_COOKIE_NAME,
  baseCookieOptions,
} from "@/lib/auth/session";
import {
  decryptLaravelCookie,
  deleteLaravelSession,
} from "@/lib/auth/laravel-session";

export async function POST(req: NextRequest) {
  const clearOpts = { ...baseCookieOptions(), maxAge: 0 };

  const laravelCookie = req.cookies.get(LARAVEL_COOKIE_NAME)?.value;
  if (laravelCookie) {
    const sessionId = decryptLaravelCookie(laravelCookie);
    if (sessionId) await deleteLaravelSession(sessionId);
  }

  const res = NextResponse.json({ success: true as const });
  res.cookies.set(SESSION_COOKIE_NAME, "", clearOpts);
  res.cookies.set(LARAVEL_COOKIE_NAME, "", clearOpts);
  return res;
}
