import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import {
  GOOGLE_OAUTH_STATE_COOKIE,
  googleCallbackUrl,
  oauthPublicOrigin,
} from "@/lib/auth/google-oauth";
import {
  SESSION_COOKIE_NAME,
  LARAVEL_COOKIE_NAME,
  baseCookieOptions,
  sessionCookieMaxAgeSec,
  signSessionToken,
} from "@/lib/auth/session";
import {
  createLaravelSession,
  encryptLaravelCookie,
} from "@/lib/auth/laravel-session";

export const dynamic = "force-dynamic";

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

type UserRow = RowDataPacket & {
  id: number;
  email: string;
  name: string;
};

/** Match Laravel GoogleController naming: local-part (max 25) + last 4 chars of Google numeric id */
function suggestedUsername(email: string, googleSub: string): string {
  const local = (email.split("@")[0] || "user").slice(0, 25);
  const suffix = String(googleSub).slice(-4);
  return `${local}${suffix}`;
}

async function ensureUniqueName(pool: ReturnType<typeof getPool>, base: string): Promise<string> {
  let name = base.slice(0, 25);
  for (let i = 0; i < 50; i++) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT id FROM users WHERE name = ? LIMIT 1",
      [name],
    );
    if (rows.length === 0) return name;
    const stem = base.slice(0, Math.max(1, 20 - String(i).length));
    name = `${stem}${i}`.slice(0, 25);
  }
  return `u${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function redirectWithError(req: NextRequest, code: string): NextResponse {
  const url = new URL("/", oauthPublicOrigin(req));
  url.searchParams.set("auth_error", code);
  const res = NextResponse.redirect(url);
  res.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", {
    ...baseCookieOptions(),
    maxAge: 0,
  });
  return res;
}

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return redirectWithError(req, "config");
  }

  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return redirectWithError(req, "denied");
  }

  const stored = req.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  if (!code || !state || !stored || state !== stored) {
    return redirectWithError(req, "state");
  }

  const redirectUri = googleCallbackUrl(req);

  let tokens: { access_token?: string; error?: string };
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    tokens = (await tokenRes.json()) as { access_token?: string; error?: string };
  } catch {
    return redirectWithError(req, "token");
  }

  if (!tokens.access_token) {
    return redirectWithError(req, "token");
  }

  let profile: GoogleUserInfo;
  try {
    const ui = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    profile = (await ui.json()) as GoogleUserInfo;
  } catch {
    return redirectWithError(req, "profile");
  }

  const googleId = profile.sub;
  const email = profile.email?.toLowerCase().trim();
  if (!googleId || !email) {
    return redirectWithError(req, "email");
  }

  const pool = getPool();

  try {
    const [existingRows] = await pool.execute<UserRow[]>(
      "SELECT id, email, name FROM users WHERE email = ? LIMIT 1",
      [email],
    );
    let user: UserRow;

    if (existingRows[0]) {
      user = existingRows[0];
      await pool.execute("UPDATE users SET google_id = ? WHERE id = ?", [googleId, user.id]);
    } else {
      const googleName = profile.name ?? email.split("@")[0];
      const passwordPlain = `${googleName}@${googleId}`;
      const hashed = await bcrypt.hash(passwordPlain, 10);
      let name = suggestedUsername(email, googleId);
      name = await ensureUniqueName(pool, name);

      await pool.execute<ResultSetHeader>(
        `INSERT INTO users (name, email, password, google_id, email_verified_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, NOW(), NOW(), NOW())`,
        [name, email, hashed, googleId],
      );

      const [inserted] = await pool.execute<UserRow[]>(
        "SELECT id, email, name FROM users WHERE email = ? LIMIT 1",
        [email],
      );
      if (!inserted[0]) {
        return redirectWithError(req, "create");
      }
      user = inserted[0];
    }

    const token = await signSessionToken({
      id: user.id,
      email: user.email,
      name: user.name,
    });

    const home = new URL("/", oauthPublicOrigin(req));
    const res = NextResponse.redirect(home);
    const cookieOpts = { ...baseCookieOptions(), maxAge: sessionCookieMaxAgeSec() };
    res.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", { ...baseCookieOptions(), maxAge: 0 });
    res.cookies.set(SESSION_COOKIE_NAME, token, cookieOpts);

    const laravelSessionId = await createLaravelSession(user.id);
    if (laravelSessionId) {
      res.cookies.set(LARAVEL_COOKIE_NAME, encryptLaravelCookie(laravelSessionId), cookieOpts);
    }

    return res;
  } catch (e) {
    console.error("[auth/google/callback]", e);
    return redirectWithError(req, "server");
  }
}
