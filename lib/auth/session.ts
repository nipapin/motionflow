import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export const SESSION_COOKIE_NAME = "next_motionflow_session";

/** Cookie name used by Laravel. Next.js reads (and optionally writes) it for SSO. */
export const LARAVEL_COOKIE_NAME = "motionflow_session";

export type SessionPayload = JWTPayload & {
  sub: string;
  email: string;
  name: string;
};

function getSigningKey(): Uint8Array {
  const raw = process.env.AUTH_SECRET ?? process.env.APP_KEY;
  if (!raw) {
    throw new Error("Set AUTH_SECRET (recommended) or APP_KEY for session signing");
  }
  if (raw.startsWith("base64:")) {
    const b64 = raw.slice(7);
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  return new TextEncoder().encode(raw);
}

type RequestLike = {
  headers: { get(name: string): string | null };
  nextUrl?: { hostname?: string };
};

function extractHostname(req?: RequestLike): string | undefined {
  if (!req) return undefined;
  const fromNextUrl = req.nextUrl?.hostname;
  if (fromNextUrl) return fromNextUrl;
  const hostHeader = req.headers.get("host") ?? req.headers.get("x-forwarded-host");
  if (!hostHeader) return undefined;
  return hostHeader.split(":")[0]?.trim() || undefined;
}

function hostMatchesDomain(hostname: string, domain: string): boolean {
  const bare = domain.startsWith(".") ? domain.slice(1) : domain;
  if (!bare) return false;
  return hostname === bare || hostname.endsWith(`.${bare}`);
}

/**
 * Returns the cookie `Domain` shared with the Laravel app (e.g. `.motionflow.com`).
 *
 * Reads `COOKIE_DOMAIN` first, then falls back to Laravel's `SESSION_DOMAIN` so
 * Next.js cookies live in the same scope as Laravel cookies in production.
 *
 * Browsers reject `Set-Cookie` with a `Domain=` attribute that is not a suffix
 * of the request host (e.g. setting `Domain=.motionflow.com` from `localhost`).
 * When `req` is provided, we drop the domain unless the current host actually
 * belongs to it — otherwise the cookie would be silently dropped.
 */
export function sharedCookieDomain(req?: RequestLike): string | undefined {
  const raw = process.env.COOKIE_DOMAIN || process.env.SESSION_DOMAIN || "";
  const domain = raw.trim();
  if (!domain) return undefined;
  // Domain attribute is invalid for localhost / bare IPs.
  if (domain === "localhost" || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(domain)) {
    return undefined;
  }
  const hostname = extractHostname(req);
  if (hostname && !hostMatchesDomain(hostname, domain)) {
    return undefined;
  }
  return domain;
}

export function baseCookieOptions(req?: RequestLike) {
  const domain = sharedCookieDomain(req);
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    ...(domain ? { domain } : {}),
  };
}

export function sessionCookieMaxAgeSec(): number {
  const laravelMinutes = Number(process.env.SESSION_LIFETIME);
  if (Number.isFinite(laravelMinutes) && laravelMinutes > 0) {
    return Math.floor(laravelMinutes * 60);
  }
  return 60 * 60 * 24 * 30;
}

export async function signSessionToken(user: {
  id: number;
  email: string;
  name: string;
}): Promise<string> {
  const key = getSigningKey();
  const maxAge = sessionCookieMaxAgeSec();
  return new SignJWT({
    email: user.email,
    name: user.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(key);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const key = getSigningKey();
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    const sub = payload.sub;
    const email = typeof payload.email === "string" ? payload.email : "";
    const name = typeof payload.name === "string" ? payload.name : "";
    if (!sub || !email) return null;
    return { ...payload, sub, email, name };
  } catch {
    return null;
  }
}
