import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import {
  SESSION_COOKIE_NAME,
  sessionCookieMaxAgeSec,
  signSessionToken,
} from "@/lib/auth/session";
import { loginSchema } from "@/lib/validations/auth";

type UserRow = RowDataPacket & {
  id: number;
  email: string;
  name: string;
  password: string;
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
    const [rows] = await pool.execute<UserRow[]>(
      "SELECT id, email, name, password FROM users WHERE email = ? LIMIT 1",
      [email],
    );
    const user = rows[0];
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

    const token = await signSessionToken({
      id: user.id,
      email: user.email,
      name: user.name,
    });

    const res = NextResponse.json({
      success: true as const,
      user: { id: user.id, email: user.email, name: user.name },
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
    console.error("[auth/login]", e);
    return NextResponse.json(
      { success: false as const, message: "Server error. Try again later." },
      { status: 500 },
    );
  }
}
