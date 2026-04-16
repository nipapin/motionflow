import { cookies } from "next/headers";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import {
  SESSION_COOKIE_NAME,
  LARAVEL_COOKIE_NAME,
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

export type SessionUser = {
  id: number;
  email: string;
  name: string;
  oauthPasswordOnly: boolean;
};

async function loadUserById(id: number): Promise<SessionUser | null> {
  try {
    const pool = getPool();
    const [rows] = await pool.execute<UserRow[]>(
      "SELECT id, email, name, google_id FROM users WHERE id = ? LIMIT 1",
      [id],
    );
    const u = rows[0];
    if (!u) return null;
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      oauthPasswordOnly: oauthPasswordOnlyFromGoogleId(u),
    };
  } catch (e) {
    console.error("[getSessionUser]", e);
    return null;
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();

  // 1. Try Next.js JWT cookie first
  const jwtToken = jar.get(SESSION_COOKIE_NAME)?.value;
  if (jwtToken) {
    const session = await verifySessionToken(jwtToken);
    if (session) {
      const id = Number(session.sub);
      if (Number.isFinite(id) && id > 0) {
        const user = await loadUserById(id);
        if (user) return user;
      }
    }
  }

  // 2. Fall back to Laravel session cookie
  const laravelCookie = jar.get(LARAVEL_COOKIE_NAME)?.value;
  if (laravelCookie) {
    const sessionId = decryptLaravelCookie(laravelCookie);
    if (sessionId) {
      const userId = await readLaravelSessionUserId(sessionId);
      if (userId) return loadUserById(userId);
    }
  }

  return null;
}
