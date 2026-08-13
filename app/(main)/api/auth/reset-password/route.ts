import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { oauthPasswordOnlyFromGoogleId } from "@/lib/auth/users-table";
import {
  deletePasswordResetToken,
  verifyPasswordResetToken,
} from "@/lib/auth/password-reset";
import { resetPasswordSchema } from "@/lib/validations/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UserRow = RowDataPacket & {
  id: number;
  email: string;
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

  const parsed = resetPasswordSchema.safeParse(body);
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

  const { email, token, password } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  try {
    const verified = await verifyPasswordResetToken(normalizedEmail, token);
    if (!verified.ok) {
      const message =
        verified.reason === "expired"
          ? "This password reset link has expired. Request a new one."
          : "This password reset link is invalid. Request a new one.";
      return NextResponse.json(
        {
          success: false as const,
          message,
          errors: { token: [message] },
        },
        { status: 422 },
      );
    }

    const pool = getPool();
    const [rows] = await pool.execute<UserRow[]>(
      "SELECT id, email, google_id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1",
      [normalizedEmail],
    );
    const user = rows[0];
    if (!user) {
      return NextResponse.json(
        {
          success: false as const,
          message: "This password reset link is invalid. Request a new one.",
          errors: { token: ["This password reset link is invalid."] },
        },
        { status: 422 },
      );
    }

    if (oauthPasswordOnlyFromGoogleId(user)) {
      await deletePasswordResetToken(normalizedEmail);
      return NextResponse.json(
        {
          success: false as const,
          message:
            "This account is linked to Google. Use Continue with Google to sign in.",
          errors: {
            email: [
              "This account is linked to Google. Password reset is not available.",
            ],
          },
        },
        { status: 422 },
      );
    }

    const hashed = await bcrypt.hash(password, 10);
    await pool.execute(
      "UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?",
      [hashed, user.id],
    );
    await deletePasswordResetToken(normalizedEmail);

    return NextResponse.json({
      success: true as const,
      message: "Your password has been reset. You can sign in now.",
    });
  } catch (e) {
    console.error("[auth/reset-password]", e);
    return NextResponse.json(
      { success: false as const, message: "Server error. Try again later." },
      { status: 500 },
    );
  }
}
