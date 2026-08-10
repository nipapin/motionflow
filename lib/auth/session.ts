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

function isLoopbackOrIpHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)
  );
}

/**
 * Public hostname as the browser sees it. Prefer `x-forwarded-host` — behind nginx
 * `Host` is often `127.0.0.1:3000` while the client is on `motionflow.pro`.
 */
export function extractPublicHostname(req?: RequestLike): string | undefined {
  if (!req) return undefined;
  const forwarded = req.headers.get("x-forwarded-host");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.split(":")[0]?.trim().toLowerCase() || undefined;
  }
  const fromNextUrl = req.nextUrl?.hostname?.trim().toLowerCase();
  if (fromNextUrl) return fromNextUrl;
  const hostHeader = req.headers.get("host");
  if (!hostHeader) return undefined;
  return hostHeader.split(":")[0]?.trim().toLowerCase() || undefined;
}

function hostMatchesDomain(hostname: string, domain: string): boolean {
  const bare = domain.startsWith(".") ? domain.slice(1) : domain;
  if (!bare) return false;
  return hostname === bare || hostname.endsWith(`.${bare}`);
}

/**
 * Returns the cookie `Domain` shared across apex + author subdomains (e.g. `.motionflow.pro`).
 *
 * Reads `COOKIE_DOMAIN` first, then Laravel's `SESSION_DOMAIN`.
 *
 * Important: behind a reverse proxy Next may see Host=`127.0.0.1` while the browser
 * is on `motionflow.pro`. Dropping `Domain` in that case makes a host-only cookie that
 * works on the apex and breaks on `premieregal.motionflow.pro`. In production we still
 * emit the configured domain for loopback Host values; browsers validate Domain against
 * the URL they requested, not the upstream Host header.
 */
export function sharedCookieDomain(req?: RequestLike): string | undefined {
  const raw = process.env.COOKIE_DOMAIN || process.env.SESSION_DOMAIN || "";
  const domain = raw.trim();
  if (!domain) return undefined;
  // Domain attribute is invalid for localhost / bare IPs.
  if (domain === "localhost" || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(domain)) {
    return undefined;
  }

  const hostname = extractPublicHostname(req);
  if (!hostname) {
    return process.env.NODE_ENV === "production" ? domain : undefined;
  }

  if (hostMatchesDomain(hostname, domain)) {
    return domain;
  }

  // Proxy hop: trust configured domain in production so subdomain SSO works.
  if (isLoopbackOrIpHostname(hostname) && process.env.NODE_ENV === "production") {
    return domain;
  }

  // Localhost / wrong public host (e.g. tunnel on another TLD): omit Domain.
  return undefined;
}

export function baseCookieOptions(req?: RequestLike) {
  const domain = sharedCookieDomain(req);
  const forwardedProto = req?.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const secure =
    process.env.NODE_ENV === "production" ||
    forwardedProto === "https" ||
    process.env.SESSION_SECURE_COOKIE === "true";
  return {
    httpOnly: true,
    secure,
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
