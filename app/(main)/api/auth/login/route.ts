import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import {
  SESSION_COOKIE_NAME,
  LARAVEL_COOKIE_NAME,
  baseCookieOptions,
  sessionCookieMaxAgeSec,
  signSessionToken,
  appendHostOnlySessionCookieClears,
} from "@/lib/auth/session";
import { authUserPayloadFromRow } from "@/lib/auth/user-payload";
import { loginSchema } from "@/lib/validations/auth";
import { ensureWebSessionSchema } from "@/lib/auth/web-session-version";
import {
  createLaravelSession,
  encryptLaravelCookie,
} from "@/lib/auth/laravel-session";
import { hasPendingEmailVerification } from "@/lib/auth/email-verification";
import {
  affiliateRefSlugFromRequest,
  attachAffiliateReferralToUser,
} from "@/lib/affiliate/attribution";

type UserRow = RowDataPacket & {
  id: number;
  email: string;
  name: string;
  password: string;
  google_id?: string | null;
  session_version: number;
};

function zodFieldErrors(err: import("zod").ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const fe = err.flatten().fieldErrors;
  for (const [k, v] of Object.entries(fe)) {
    if (v?.length) out[k] = v;
  }
  return out;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false as const, message: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false as const,
        message: "The given data was invalid.",
        errors: zodFieldErrors(parsed.error),
      },
      { status: 422 },
    );
  }

  const { email, password } = parsed.data;

  try {
    const pool = getPool();
    await ensureWebSessionSchema();
    const [rows] = await pool.execute<UserRow[]>(
      `SELECT u.id, u.email, u.name, u.password, u.google_id, COALESCE(v.version, 0) AS session_version
       FROM users u LEFT JOIN user_web_session_versions v ON v.user_id = u.id WHERE u.email = ? LIMIT 1`,
      [email],
    );
    const user = rows[0];
    const sessionVersion = Number(user?.session_version ?? 0);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return NextResponse.json(
        {
          success: false as const,
          message: "These credentials do not match our records.",
          errors: {
            email: ["These credentials do not match our records."],
          },
        },
        { status: 422 },
      );
    }

    if (await hasPendingEmailVerification(user.email)) {
      return NextResponse.json(
        {
          success: false as const,
          code: "EMAIL_NOT_VERIFIED" as const,
          message:
            "Confirm your email before signing in. Check the inbox for the address you registered with.",
          errors: {
            email: ["Email is not confirmed yet."],
          },
          email: user.email,
        },
        { status: 403 },
      );
    }

    // Accounts that existed before the partner's link was clicked are only
    // attributable here — there is no signup event to hook into.
    await attachAffiliateReferralToUser({
      userId: user.id,
      email: user.email,
      slug: affiliateRefSlugFromRequest(req),
    });

    const token = await signSessionToken({
      id: user.id,
      email: user.email,
      name: user.name,
      sessionVersion,
    });

    const res = NextResponse.json({
      success: true as const,
      user: await authUserPayloadFromRow(user),
    });
    appendHostOnlySessionCookieClears(res);
    const cookieOpts = { ...baseCookieOptions(req), maxAge: sessionCookieMaxAgeSec() };
    res.cookies.set(SESSION_COOKIE_NAME, token, cookieOpts);

    const laravelSessionId = await createLaravelSession(user.id, sessionVersion);
    if (laravelSessionId) {
      res.cookies.set(LARAVEL_COOKIE_NAME, encryptLaravelCookie(laravelSessionId), cookieOpts);
    }

    return res;
  } catch (e) {
    console.error("[auth/login]", e);
    return NextResponse.json(
      { success: false as const, message: "Server error. Try again later." },
      { status: 500 },
    );
  }
}
