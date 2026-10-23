import "server-only";

import { SESSION_COOKIE_NAME, LARAVEL_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { decryptLaravelCookie, readLaravelSession } from "@/lib/auth/laravel-session";

/** Preserve the verified version when refreshing an existing session. */
export async function resolveRequestWebSession(cookies: { get(name: string): { value: string } | undefined }) {
  const token = cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    const session = await verifySessionToken(token);
    if (session) return { userId: Number(session.sub), sessionVersion: session.sessionVersion };
  }
  const laravelCookie = cookies.get(LARAVEL_COOKIE_NAME)?.value;
  const sessionId = laravelCookie ? decryptLaravelCookie(laravelCookie) : null;
  return sessionId ? readLaravelSession(sessionId) : null;
}
