import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { withAccountAudit } from "@/lib/account-audit";
import {
  SESSION_COOKIE_NAME,
  LARAVEL_COOKIE_NAME,
  baseCookieOptions,
  sessionCookieMaxAgeSec,
  signSessionToken,
  appendHostOnlySessionCookieClears,
} from "@/lib/auth/session";
import {
  createLaravelSession,
  encryptLaravelCookie,
} from "@/lib/auth/laravel-session";
import { resolveRequestWebSession } from "@/lib/auth/request-web-session";
import { advanceWebSessionVersion, getWebSessionVersion } from "@/lib/auth/web-session-version";
import { resolveAuthUserFlags } from "@/lib/auth/google-account";
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

export async function PATCH(req: NextRequest) {
  const session = await resolveRequestWebSession(req.cookies);
  if (!session) {
    return NextResponse.json(
      { success: false as const, message: "Unauthorized." },
      { status: 401 },
    );
  }
  const { userId } = session;
  let sessionVersion = session.sessionVersion;

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

  const { name, email, currentPassword, newPassword, newPassword_confirmation, logoutOtherSessions } =
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

    const authFlags = await resolveAuthUserFlags(row);
    const googleLinked = authFlags.hasGoogleLinked;
    let nextEmail = row.email;
    let nextName = row.name;
    let passwordToken: string | undefined;
    let replacementLaravelCookie: string | undefined;

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
      await withAccountAudit({ actorUserId: userId, source: "profile" }, (conn) =>
        conn.execute("UPDATE users SET name = ?, updated_at = NOW() WHERE id = ?", [name, userId]),
      );
      nextName = name;
    }

    if (hasEmail && email.toLowerCase() !== row.email.toLowerCase()) {
      if (googleLinked) {
        return NextResponse.json(
          {
            success: false as const,
            message: "Email cannot be changed for accounts linked to Google.",
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
      await withAccountAudit({ actorUserId: userId, source: "profile" }, (conn) =>
        conn.execute("UPDATE users SET email = ?, updated_at = NOW() WHERE id = ?", [email.toLowerCase(), userId]),
      );
      nextEmail = email.toLowerCase();
    }

    if (wantsPassword) {
      if (googleLinked) {
        return NextResponse.json(
          {
            success: false as const,
            message: "Password cannot be changed for accounts linked to Google.",
            errors: {
              newPassword: [
                "This account is linked to Google. Password change is not available.",
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
      await withAccountAudit({ actorUserId: userId, source: "profile" }, async (conn) => {
        await conn.beginTransaction();
        try {
          // Serialize concurrent password changes and do not revive a revoked session.
          const [locked] = await conn.execute<UserRow[]>("SELECT password FROM users WHERE id = ? FOR UPDATE", [userId]);
          if (locked[0]?.password !== row.password || await getWebSessionVersion(userId, conn) !== sessionVersion) {
            throw new Error("WEB_SESSION_CHANGED");
          }
          if (logoutOtherSessions) {
            sessionVersion = await advanceWebSessionVersion(conn, userId);
            const sessionId = await createLaravelSession(userId, sessionVersion);
            if (!sessionId) throw new Error("Could not preserve the current website session");
            replacementLaravelCookie = encryptLaravelCookie(sessionId);
          }
          passwordToken = await signSessionToken({ id: userId, email: nextEmail, name: nextName, sessionVersion });
          await conn.execute(
            `UPDATE users SET password = ?, ${logoutOtherSessions ? "remember_token = NULL," : ""} updated_at = NOW() WHERE id = ?`,
            [hashed, userId],
          );
          await conn.commit();
        } catch (error) {
          await conn.rollback();
          throw error;
        }
      });
    }

    const newToken = passwordToken ?? await signSessionToken({
      id: userId,
      email: nextEmail,
      name: nextName,
      sessionVersion,
    });

    const flagsAfter = await resolveAuthUserFlags({
      ...row,
      email: nextEmail,
      name: nextName,
    });

    const res = NextResponse.json({
      success: true as const,
      user: {
        id: userId,
        email: nextEmail,
        name: nextName,
        ...flagsAfter,
      },
    });
    const cookieOptions = {
      ...baseCookieOptions(req),
      maxAge: sessionCookieMaxAgeSec(),
    };
    if (replacementLaravelCookie) appendHostOnlySessionCookieClears(res);
    res.cookies.set(SESSION_COOKIE_NAME, newToken, cookieOptions);
    if (replacementLaravelCookie) res.cookies.set(LARAVEL_COOKIE_NAME, replacementLaravelCookie, cookieOptions);
    return res;
  } catch (e) {
    if (e instanceof Error && e.message === "WEB_SESSION_CHANGED") {
      return NextResponse.json({ success: false, message: "Your session or password has changed. Sign in again." }, { status: 401 });
    }
    console.error("[auth/profile]", e);
    return NextResponse.json(
      { success: false as const, message: "Server error. Try again later." },
      { status: 500 },
    );
  }
}
