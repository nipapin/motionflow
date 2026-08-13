import { NextRequest, NextResponse } from "next/server";
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
import {
  createLaravelSession,
  encryptLaravelCookie,
} from "@/lib/auth/laravel-session";
import {
  deleteEmailVerificationToken,
  verifyEmailVerificationToken,
} from "@/lib/auth/email-verification";
import { verifyEmailSchema } from "@/lib/validations/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UserRow = RowDataPacket & {
  id: number;
  email: string;
  name: string;
  password: string;
  google_id?: string | null;
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

  const parsed = verifyEmailSchema.safeParse(body);
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

  const email = parsed.data.email.trim().toLowerCase();
  const { token } = parsed.data;

  try {
    const verified = await verifyEmailVerificationToken(email, token);
    if (!verified.ok) {
      const message =
        verified.reason === "expired"
          ? "This confirmation link has expired. Request a new one from sign in."
          : "This confirmation link is invalid. Request a new one from sign in.";
      return NextResponse.json(
        { success: false as const, message, errors: { token: [message] } },
        { status: 422 },
      );
    }

    const pool = getPool();
    const [rows] = await pool.execute<UserRow[]>(
      "SELECT id, email, name, password, google_id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1",
      [email],
    );
    const user = rows[0];
    if (!user) {
      return NextResponse.json(
        {
          success: false as const,
          message: "This confirmation link is invalid.",
        },
        { status: 422 },
      );
    }

    await pool.execute(
      "UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()), updated_at = NOW() WHERE id = ?",
      [user.id],
    );
    await deleteEmailVerificationToken(email);

    const sessionToken = await signSessionToken({
      id: user.id,
      email: user.email,
      name: user.name,
    });

    const res = NextResponse.json({
      success: true as const,
      user: await authUserPayloadFromRow(user),
    });
    appendHostOnlySessionCookieClears(res);
    const cookieOpts = { ...baseCookieOptions(req), maxAge: sessionCookieMaxAgeSec() };
    res.cookies.set(SESSION_COOKIE_NAME, sessionToken, cookieOpts);

    const laravelSessionId = await createLaravelSession(user.id);
    if (laravelSessionId) {
      res.cookies.set(
        LARAVEL_COOKIE_NAME,
        encryptLaravelCookie(laravelSessionId),
        cookieOpts,
      );
    }

    return res;
  } catch (e) {
    console.error("[auth/verify-email]", e);
    return NextResponse.json(
      { success: false as const, message: "Server error. Try again later." },
      { status: 500 },
    );
  }
}
