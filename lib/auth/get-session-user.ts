import { cookies } from "next/headers";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import {
  SESSION_COOKIE_NAME,
  LARAVEL_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/auth/session";
import { authUserPayloadFromRow } from "@/lib/auth/user-payload";
import {
  decryptLaravelCookie,
  readLaravelSessionUserId,
} from "@/lib/auth/laravel-session";

type UserRow = RowDataPacket & {
  id: number;
  email: string;
  name: string;
  password: string;
  google_id?: string | null;
  access?: number | null;
};

export type SessionUser = {
  id: number;
  email: string;
  name: string;
  oauthPasswordOnly: boolean;
  hasGoogleLinked: boolean;
  canChangePassword: boolean;
  canUnlinkGoogle: boolean;
  /** Laravel contributor tier (see `lib/auth/access-control.ts`). */
  access: number;
};

async function loadUserById(id: number): Promise<SessionUser | null> {
  try {
    const pool = getPool();
    const [rows] = await pool.execute<UserRow[]>(
      "SELECT id, email, name, password, google_id, access FROM users WHERE id = ? LIMIT 1",
      [id],
    );
    const u = rows[0];
    if (!u) return null;
    const payload = await authUserPayloadFromRow(u);
    const accessNum = Number(u.access ?? 0);
    return {
      ...payload,
      access: Number.isFinite(accessNum) ? accessNum : 0,
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
