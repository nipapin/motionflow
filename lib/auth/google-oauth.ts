import type { NextRequest } from "next/server";

/** Cookie storing CSRF state for Google OAuth */
export const GOOGLE_OAUTH_STATE_COOKIE = "google_oauth_state";
export const GOOGLE_OAUTH_STATE_MAX_AGE = 600;

/**
 * Origin used for Google "Authorized redirect URI" (must match Google Cloud console).
 * Set AUTH_PUBLIC_URL or NEXT_PUBLIC_APP_URL in production if the app is behind a proxy.
 */
export function oauthPublicOrigin(req: NextRequest): string {
  const explicit = process.env.AUTH_PUBLIC_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  return req.nextUrl.origin;
}

export function googleCallbackUrl(req: NextRequest): string {
  return `${oauthPublicOrigin(req)}/api/auth/google/callback`;
}
