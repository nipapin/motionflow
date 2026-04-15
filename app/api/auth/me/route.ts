import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { SESSION_COOKIE_NAME, baseCookieOptions, verifySessionToken } from "@/lib/auth/session";
import { oauthPasswordOnlyFromGoogleId } from "@/lib/auth/users-table";

type UserRow = RowDataPacket & {
  id: number;
  email: string;
  name: string;
  google_id?: string | null;
};

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  const session = await verifySessionToken(token);
  if (!session) {
    const res = NextResponse.json({ user: null }, { status: 200 });
    res.cookies.set(SESSION_COOKIE_NAME, "", {
      ...baseCookieOptions(),
      maxAge: 0,
    });
    return res;
  }

  try {
    const pool = getPool();
    const [rows] = await pool.execute<UserRow[]>(
      "SELECT id, email, name, google_id FROM users WHERE id = ? LIMIT 1",
      [Number(session.sub)],
    );
    const user = rows[0];
    if (!user) {
      const res = NextResponse.json({ user: null }, { status: 200 });
      res.cookies.set(SESSION_COOKIE_NAME, "", {
        ...baseCookieOptions(),
        maxAge: 0,
      });
      return res;
    }
    const oauthPasswordOnly = oauthPasswordOnlyFromGoogleId(user);
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        oauthPasswordOnly,
        canChangePassword: !oauthPasswordOnly,
      },
    });
  } catch (e) {
    console.error("[auth/me]", e);
    return NextResponse.json({ user: null }, { status: 200 });
  }
}
