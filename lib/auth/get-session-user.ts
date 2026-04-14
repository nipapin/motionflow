import { cookies } from "next/headers";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { oauthPasswordOnlyFromGoogleId } from "@/lib/auth/users-table";

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

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await verifySessionToken(token);
  if (!session) return null;

  const id = Number(session.sub);
  if (!Number.isFinite(id) || id <= 0) return null;

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
