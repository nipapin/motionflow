import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, baseCookieOptions } from "@/lib/auth/session";

export async function POST() {
  const res = NextResponse.json({ success: true as const });
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    ...baseCookieOptions(),
    maxAge: 0,
  });
  return res;
}
