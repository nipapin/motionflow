import type { NextRequest } from "next/server";

/** Cookie storing CSRF state for Google OAuth */
export const GOOGLE_OAUTH_STATE_COOKIE = "google_oauth_state";
export const GOOGLE_OAUTH_STATE_MAX_AGE = 600;

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

function isLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
}

/**
 * Local dev often runs at https://localhost (Next/experimental TLS) while Google
 * Console redirect URIs are registered as http://localhost — normalize unless forced.
 */
function normalizeOauthOrigin(origin: string, explicitEnv = false): string {
  const trimmed = stripTrailingSlash(origin);
  try {
    const u = new URL(trimmed);
    if (
      isLocalHostname(u.hostname) &&
      process.env.NODE_ENV !== "production" &&
      !explicitEnv &&
      u.protocol === "https:"
    ) {
      u.protocol = "http:";
      return u.origin;
    }
  } catch {
    /* use trimmed */
  }
  return trimmed;
}

function originFromRequestHeaders(req: NextRequest): string | null {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = forwardedHost?.split(",")[0]?.trim() || req.headers.get("host")?.trim();
  if (!host || isLocalHostname(host.split(":")[0] ?? host)) {
    return null;
  }
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const proto = (forwardedProto?.split(",")[0]?.trim() || "https").replace(/:$/, "");
  return normalizeOauthOrigin(`${proto}://${host}`);
}

function explicitEnvOrigin(): string | null {
  const isProd = process.env.NODE_ENV === "production";
  const authPublic = process.env.AUTH_PUBLIC_URL?.trim();
  if (authPublic) {
    try {
      if (isProd && isLocalHostname(new URL(authPublic).hostname)) {
        console.warn(
          "[google-oauth] AUTH_PUBLIC_URL points to localhost in production; ignoring.",
        );
      } else {
        return normalizeOauthOrigin(authPublic, true);
      }
    } catch {
      console.warn("[google-oauth] Invalid AUTH_PUBLIC_URL; ignoring.");
    }
  }

  // NEXT_PUBLIC_* is inlined at build time — often still localhost on production deploys.
  const nextPublic = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!isProd && nextPublic) {
    return normalizeOauthOrigin(nextPublic, true);
  }
  if (isProd && nextPublic) {
    try {
      if (!isLocalHostname(new URL(nextPublic).hostname)) {
        return normalizeOauthOrigin(nextPublic, true);
      }
      console.warn(
        "[google-oauth] NEXT_PUBLIC_APP_URL is localhost in production build; ignoring. Set AUTH_PUBLIC_URL on the server.",
      );
    } catch {
      /* ignore */
    }
  }

  return null;
}

/**
 * Origin used for Google "Authorized redirect URI" (must match Google Cloud console).
 * Production: set AUTH_PUBLIC_URL=https://next.motionflow.pro on the server (not localhost).
 */
export function oauthPublicOrigin(req: NextRequest): string {
  const fromEnv = explicitEnvOrigin();
  if (fromEnv) return fromEnv;

  const fromHeaders = originFromRequestHeaders(req);
  if (fromHeaders) return fromHeaders;

  const fromNext = normalizeOauthOrigin(req.nextUrl.origin);
  if (process.env.NODE_ENV === "production" && isLocalHostname(new URL(fromNext).hostname)) {
    throw new Error(
      "Google OAuth redirect origin is localhost in production. Set AUTH_PUBLIC_URL=https://next.motionflow.pro on the server.",
    );
  }

  return fromNext;
}

export function googleCallbackUrl(req: NextRequest): string {
  return `${oauthPublicOrigin(req)}/api/auth/google/callback`;
}
