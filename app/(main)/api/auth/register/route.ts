import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { registerSchema } from "@/lib/validations/auth";
import {
  generateEmailVerificationToken,
  storeEmailVerificationToken,
} from "@/lib/auth/email-verification";
import { sendVerifyEmail } from "@/lib/auth/password-reset-mailer";
import { mailSiteOriginFromHeaders } from "@/lib/mail/public-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const parsed = registerSchema.safeParse(body);
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

  const { email, name, password, mailing } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();
  const siteOrigin = mailSiteOriginFromHeaders(req.headers);

  try {
    const pool = getPool();

    const [emailRows] = await pool.execute<RowDataPacket[]>(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [normalizedEmail],
    );
    if (emailRows.length > 0) {
      return NextResponse.json(
        {
          success: false as const,
          message: "The given data was invalid.",
          errors: { email: ["The email has already been taken."] },
        },
        { status: 422 },
      );
    }

    const [nameRows] = await pool.execute<RowDataPacket[]>(
      "SELECT id FROM users WHERE name = ? LIMIT 1",
      [name],
    );
    if (nameRows.length > 0) {
      return NextResponse.json(
        {
          success: false as const,
          message: "The given data was invalid.",
          errors: { name: ["The name has already been taken."] },
        },
        { status: 422 },
      );
    }

    const hashed = await bcrypt.hash(password, 10);
    const mailingVal: number | null = mailing ? 0 : null;

    await pool.execute<ResultSetHeader>(
      `INSERT INTO users (name, email, password, mailing, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())`,
      [name, normalizedEmail, hashed, mailingVal],
    );

    const token = generateEmailVerificationToken();
    await storeEmailVerificationToken(normalizedEmail, token);
    try {
      await sendVerifyEmail({
        email: normalizedEmail,
        token,
        name,
        siteOrigin,
      });
    } catch (sendErr) {
      console.error("[auth/register] verify email send", sendErr);
      return NextResponse.json(
        {
          success: true as const,
          needsEmailVerification: true as const,
          email: normalizedEmail,
          message:
            "Account created, but we could not send the confirmation email. Try resending it from sign in.",
        },
        { status: 201 },
      );
    }

    return NextResponse.json({
      success: true as const,
      needsEmailVerification: true as const,
      email: normalizedEmail,
    });
  } catch (e) {
    console.error("[auth/register]", e);
    return NextResponse.json(
      { success: false as const, message: "Server error. Try again later." },
      { status: 500 },
    );
  }
}
