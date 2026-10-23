import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { withAccountAudit } from "@/lib/account-audit";
import { resolveAuthUserFlags } from "@/lib/auth/google-account";
import { oauthPasswordOnlyFromGoogleId } from "@/lib/auth/users-table";
import {
  SESSION_COOKIE_NAME,
  baseCookieOptions,
  sessionCookieMaxAgeSec,
  signSessionToken,
} from "@/lib/auth/session";
import { resolveRequestWebSession } from "@/lib/auth/request-web-session";

type UserRow = RowDataPacket & {
  id: number;
  email: string;
  name: string;
  password: string;
  google_id?: string | null;
};

export async function POST(req: NextRequest) {
  const session = await resolveRequestWebSession(req.cookies);
  if (!session) {
    return NextResponse.json(
      { success: false as const, message: "Unauthorized." },
      { status: 401 },
    );
  }
  const { userId, sessionVersion } = session;

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

    if (!oauthPasswordOnlyFromGoogleId(row)) {
      return NextResponse.json(
        {
          success: false as const,
          message: "No Google account is linked to this profile.",
        },
        { status: 422 },
      );
    }

    await withAccountAudit({ actorUserId: userId, source: "profile" }, (conn) =>
      conn.execute("UPDATE users SET google_id = NULL, updated_at = NOW() WHERE id = ?", [userId]),
    );

    const flagsAfter = await resolveAuthUserFlags({
      ...row,
      google_id: null,
    });

    const newToken = await signSessionToken({
      id: userId,
      email: row.email,
      name: row.name,
      sessionVersion,
    });

    const res = NextResponse.json({
      success: true as const,
      user: {
        id: userId,
        email: row.email,
        name: row.name,
        ...flagsAfter,
      },
    });
    res.cookies.set(SESSION_COOKIE_NAME, newToken, {
      ...baseCookieOptions(req),
      maxAge: sessionCookieMaxAgeSec(),
    });
    return res;
  } catch (e) {
    console.error("[auth/profile/unlink-google]", e);
    return NextResponse.json(
      { success: false as const, message: "Server error. Try again later." },
      { status: 500 },
    );
  }
}
