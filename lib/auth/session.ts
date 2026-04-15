import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export const SESSION_COOKIE_NAME = "motionflow_session";

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

export function baseCookieOptions() {
  const domain = process.env.COOKIE_DOMAIN || undefined;
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
