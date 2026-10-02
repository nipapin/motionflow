import "server-only";

import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import type { AccountAuditEntry, AccountAuditPage } from "@/lib/account-audit-shared";

export type AccountAuditContext = {
  actorUserId?: number | null;
  source: "admin.users" | "admin.credits" | "profile" | "password_reset"
    | "email_verification" | "google_oauth" | "registration";
};

const CLEAR_CONTEXT = "SET @account_audit_actor_id = NULL, @account_audit_source = NULL";

/** The context and mutation must run on the same checked-out connection. */
export async function withAccountAudit<T>(
  context: AccountAuditContext,
  work: (connection: PoolConnection) => Promise<T>,
): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    await conn.execute(
      "SET @account_audit_actor_id = ?, @account_audit_source = ?",
      [context.actorUserId ?? null, context.source],
    );
    return await work(conn);
  } finally {
    // Session variables survive rollback; never return a dirty connection to the pool.
    try {
      await conn.query(CLEAR_CONTEXT);
      conn.release();
    } catch {
      conn.destroy();
    }
  }
}

export function isAccountAuditCursor(value: string): boolean {
  return /^[1-9]\d{0,19}$/.test(value) && BigInt(value) <= BigInt("18446744073709551615");
}

export async function listAccountAudit(
  userId: number,
  cursor?: string,
): Promise<AccountAuditPage> {
  if (!Number.isSafeInteger(userId) || userId <= 0 || (cursor && !isAccountAuditCursor(cursor))) {
    throw new Error("INVALID_HISTORY_PARAMS");
  }
  type AuditRow = RowDataPacket & {
    id: string;
    user_id: number;
    actor_user_id: number | null;
    actor_name: string | null;
    source: string;
    action: AccountAuditEntry["action"];
    changes: AccountAuditEntry["changes"] | string;
    created_at: string;
  };
  const [rows] = await getPool().execute<AuditRow[]>(
    `SELECT CAST(a.id AS CHAR) AS id, a.user_id, a.actor_user_id,
            actor.name AS actor_name, a.source, a.action, a.changes,
            DATE_FORMAT(a.created_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS created_at
       FROM user_account_audit a
       LEFT JOIN users actor ON actor.id = a.actor_user_id
      WHERE a.user_id = ? ${cursor ? "AND a.id < ?" : ""}
      ORDER BY a.id DESC LIMIT 51`,
    cursor ? [userId, cursor] : [userId],
  );
  const entries = rows.slice(0, 50).map((row): AccountAuditEntry => ({
    id: row.id,
    userId: Number(row.user_id),
    actorUserId: row.actor_user_id == null ? null : Number(row.actor_user_id),
    actorName: row.actor_name,
    source: row.source,
    action: row.action,
    changes: typeof row.changes === "string" ? JSON.parse(row.changes) : row.changes,
    createdAt: row.created_at,
  }));
  return { entries, nextCursor: rows.length > 50 ? entries.at(-1)!.id : null };
}
