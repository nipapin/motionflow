import { NextRequest, NextResponse } from "next/server";
import {
  LARAVEL_COOKIE_NAME,
  appendClearedSessionCookies,
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
  appendClearedSessionCookies(res, req);
  return res;
}
