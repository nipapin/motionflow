import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import {
  SESSION_COOKIE_NAME,
  LARAVEL_COOKIE_NAME,
  baseCookieOptions,
  verifySessionToken,
} from "@/lib/auth/session";
import { oauthPasswordOnlyFromGoogleId } from "@/lib/auth/users-table";
import {
  decryptLaravelCookie,
  readLaravelSessionUserId,
} from "@/lib/auth/laravel-session";

type UserRow = RowDataPacket & {
  id: number;
  email: string;
  name: string;
  google_id?: string | null;
};

function userJson(user: UserRow) {
  const oauthPasswordOnly = oauthPasswordOnlyFromGoogleId(user);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    oauthPasswordOnly,
    canChangePassword: !oauthPasswordOnly,
  };
}

async function findUserById(id: number): Promise<UserRow | null> {
  const pool = getPool();
  const [rows] = await pool.execute<UserRow[]>(
    "SELECT id, email, name, google_id FROM users WHERE id = ? LIMIT 1",
    [id],
  );
  return rows[0] ?? null;
}

export async function GET(req: NextRequest) {
  // 1. Try Next.js JWT cookie
  const jwtToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (jwtToken) {
    const session = await verifySessionToken(jwtToken);
    if (session) {
      try {
        const user = await findUserById(Number(session.sub));
        if (user) return NextResponse.json({ user: userJson(user) });
      } catch (e) {
        console.error("[auth/me]", e);
      }
    }
    // Invalid JWT — clear it
    const res = NextResponse.json({ user: null }, { status: 200 });
    res.cookies.set(SESSION_COOKIE_NAME, "", { ...baseCookieOptions(req), maxAge: 0 });
    return res;
  }

  // 2. Fall back to Laravel session cookie
  const laravelCookie = req.cookies.get(LARAVEL_COOKIE_NAME)?.value;
  if (laravelCookie) {
    try {
      const sessionId = decryptLaravelCookie(laravelCookie);
      if (sessionId) {
        const userId = await readLaravelSessionUserId(sessionId);
        if (userId) {
          const user = await findUserById(userId);
          if (user) return NextResponse.json({ user: userJson(user) });
        }
      }
    } catch (e) {
      console.error("[auth/me:laravel]", e);
    }
  }

  return NextResponse.json({ user: null }, { status: 200 });
}
