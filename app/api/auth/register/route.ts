import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import {
  SESSION_COOKIE_NAME,
  sessionCookieMaxAgeSec,
  signSessionToken,
} from "@/lib/auth/session";
import { registerSchema } from "@/lib/validations/auth";

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

  try {
    const pool = getPool();

    const [emailRows] = await pool.execute<RowDataPacket[]>(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [email],
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

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO users (name, email, password, mailing, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())`,
      [name, email, hashed, mailingVal],
    );

    const id = result.insertId;
    const token = await signSessionToken({ id, email, name });

    const res = NextResponse.json({
      success: true as const,
      user: { id, email, name },
    });
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: sessionCookieMaxAgeSec(),
    });
    return res;
  } catch (e) {
    console.error("[auth/register]", e);
    return NextResponse.json(
      { success: false as const, message: "Server error. Try again later." },
      { status: 500 },
    );
  }
}
