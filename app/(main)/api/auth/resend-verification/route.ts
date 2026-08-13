import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import { oauthPasswordOnlyFromGoogleId } from "@/lib/auth/users-table";
import {
  generateEmailVerificationToken,
  storeEmailVerificationToken,
} from "@/lib/auth/email-verification";
import { sendVerifyEmail } from "@/lib/auth/password-reset-mailer";
import { mailSiteOriginFromHeaders } from "@/lib/mail/public-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UserRow = RowDataPacket & {
  id: number;
  email: string;
  name: string;
  email_verified_at?: Date | string | null;
  google_id?: string | null;
};

const GENERIC_SUCCESS =
  "If this email still needs confirmation, we’ve sent a new link.";

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

  const parsed = forgotPasswordSchema.safeParse(body);
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
  const siteOrigin = mailSiteOriginFromHeaders(req.headers);

  try {
    const pool = getPool();
    const [rows] = await pool.execute<UserRow[]>(
      "SELECT id, email, name, email_verified_at, google_id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1",
      [email],
    );
    const user = rows[0];

    if (
      user &&
      !user.email_verified_at &&
      !oauthPasswordOnlyFromGoogleId(user)
    ) {
      const token = generateEmailVerificationToken();
      await storeEmailVerificationToken(user.email, token);
      await sendVerifyEmail({
        email: user.email,
        token,
        name: user.name,
        siteOrigin,
      });
    }

    return NextResponse.json({
      success: true as const,
      message: GENERIC_SUCCESS,
    });
  } catch (e) {
    console.error("[auth/resend-verification]", e);
    return NextResponse.json(
      { success: false as const, message: "Server error. Try again later." },
      { status: 500 },
    );
  }
}
