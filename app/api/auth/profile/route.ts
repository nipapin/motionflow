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
  verifySessionToken,
} from "@/lib/auth/session";
import {
  decryptLaravelCookie,
  readLaravelSessionUserId,
} from "@/lib/auth/laravel-session";
import { oauthPasswordOnlyFromGoogleId } from "@/lib/auth/users-table";
import { profilePatchSchema } from "@/lib/validations/profile";

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

async function resolveUserId(req: NextRequest): Promise<number | null> {
  const jwtToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (jwtToken) {
    const session = await verifySessionToken(jwtToken);
    if (session) {
      const id = Number(session.sub);
      if (Number.isFinite(id) && id > 0) return id;
    }
  }
  const laravelCookie = req.cookies.get(LARAVEL_COOKIE_NAME)?.value;
  if (laravelCookie) {
    const sessionId = decryptLaravelCookie(laravelCookie);
    if (sessionId) return readLaravelSessionUserId(sessionId);
  }
  return null;
}

export async function PATCH(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) {
    return NextResponse.json(
      { success: false as const, message: "Unauthorized." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false as const, message: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = profilePatchSchema.safeParse(body);
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

  const { name, email, currentPassword, newPassword, newPassword_confirmation } =
    parsed.data;

  const hasName = name !== undefined;
  const hasEmail = email !== undefined;
  const wantsPassword =
    (newPassword !== undefined && newPassword.length > 0) ||
    (newPassword_confirmation !== undefined &&
      (newPassword_confirmation?.length ?? 0) > 0);

  if (!hasName && !hasEmail && !wantsPassword) {
    return NextResponse.json(
      {
        success: false as const,
        message: "Nothing to update.",
        errors: { _form: ["Provide name, email, or password fields to update."] },
      },
      { status: 422 },
    );
  }

  try {
    const pool = getPool();
    const [rows] = await pool.execute<UserRow[]>(
      "SELECT id, email, name, password, google_id FROM users WHERE id = ? LIMIT 1",
      [userId],
    );
    const row = rows[0];
    if (!row) {
      return NextResponse.json(
        { success: false as const, message: "Unauthorized." },
        { status: 401 },
      );
    }

    const oauthOnly = oauthPasswordOnlyFromGoogleId(row);
    let nextEmail = row.email;
    let nextName = row.name;

    if (hasName && name !== row.name) {
      const [taken] = await pool.execute<RowDataPacket[]>(
        "SELECT id FROM users WHERE name = ? AND id <> ? LIMIT 1",
        [name, userId],
      );
      if (taken.length > 0) {
        return NextResponse.json(
          {
            success: false as const,
            message: "The given data was invalid.",
            errors: { name: ["The name has already been taken."] },
          },
          { status: 422 },
        );
      }
      await pool.execute("UPDATE users SET name = ?, updated_at = NOW() WHERE id = ?", [
        name,
        userId,
      ]);
      nextName = name;
    }

    if (hasEmail && email.toLowerCase() !== row.email.toLowerCase()) {
      if (oauthOnly) {
        return NextResponse.json(
          {
            success: false as const,
            message: "Email cannot be changed for accounts that sign in with Google only.",
            errors: { email: ["Use your Google account to change the email."] },
          },
          { status: 422 },
        );
      }
      if (!currentPassword?.length) {
        return NextResponse.json(
          {
            success: false as const,
            message: "The given data was invalid.",
            errors: { currentPassword: ["Current password is required to change email."] },
          },
          { status: 422 },
        );
      }
      if (!(await bcrypt.compare(currentPassword, row.password))) {
        return NextResponse.json(
          {
            success: false as const,
            message: "The given data was invalid.",
            errors: { currentPassword: ["Current password is incorrect."] },
          },
          { status: 422 },
        );
      }
      const [emailTaken] = await pool.execute<RowDataPacket[]>(
        "SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id <> ? LIMIT 1",
        [email, userId],
      );
      if (emailTaken.length > 0) {
        return NextResponse.json(
          {
            success: false as const,
            message: "The given data was invalid.",
            errors: { email: ["The email has already been taken."] },
          },
          { status: 422 },
        );
      }
      await pool.execute("UPDATE users SET email = ?, updated_at = NOW() WHERE id = ?", [
        email.toLowerCase(),
        userId,
      ]);
      nextEmail = email.toLowerCase();
    }

    if (wantsPassword) {
      if (oauthOnly) {
        return NextResponse.json(
          {
            success: false as const,
            message: "Password can only be changed for accounts that use email and password.",
            errors: {
              newPassword: [
                "This account signs in with Google. Password change is not available.",
              ],
            },
          },
          { status: 422 },
        );
      }
      if (!currentPassword?.length || !newPassword?.length) {
        return NextResponse.json(
          {
            success: false as const,
            message: "The given data was invalid.",
            errors: { currentPassword: ["Current password is required."] },
          },
          { status: 422 },
        );
      }
      if (newPassword !== newPassword_confirmation) {
        return NextResponse.json(
          {
            success: false as const,
            message: "The given data was invalid.",
            errors: { newPassword_confirmation: ["Password confirmation does not match."] },
          },
          { status: 422 },
        );
      }
      if (!(await bcrypt.compare(currentPassword, row.password))) {
        return NextResponse.json(
          {
            success: false as const,
            message: "The given data was invalid.",
            errors: { currentPassword: ["Current password is incorrect."] },
          },
          { status: 422 },
        );
      }
      const hashed = await bcrypt.hash(newPassword, 10);
      await pool.execute("UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?", [
        hashed,
        userId,
      ]);
    }

    const newToken = await signSessionToken({
      id: userId,
      email: nextEmail,
      name: nextName,
    });

    const res = NextResponse.json({
      success: true as const,
      user: {
        id: userId,
        email: nextEmail,
        name: nextName,
        oauthPasswordOnly: oauthOnly,
        canChangePassword: !oauthOnly,
      },
    });
    res.cookies.set(SESSION_COOKIE_NAME, newToken, {
      ...baseCookieOptions(),
      maxAge: sessionCookieMaxAgeSec(),
    });
    return res;
  } catch (e) {
    console.error("[auth/profile]", e);
    return NextResponse.json(
      { success: false as const, message: "Server error. Try again later." },
      { status: 500 },
    );
  }
}
