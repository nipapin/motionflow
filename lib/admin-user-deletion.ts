import "server-only";

import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { withAccountAudit } from "@/lib/account-audit";

export class AdminUserDeletionError extends Error {
  constructor(readonly code: "SELF_DELETE_FORBIDDEN" | "NOT_FOUND") {
    super(code);
    this.name = "AdminUserDeletionError";
  }
}

export async function deleteAdminUser(id: number, adminUserId: number): Promise<void> {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AdminUserDeletionError("NOT_FOUND");
  }
  if (id === adminUserId) {
    throw new AdminUserDeletionError("SELF_DELETE_FORBIDDEN");
  }

  await withAccountAudit({ actorUserId: adminUserId, source: "admin.users" }, async (conn) => {
    try {
      await conn.beginTransaction();
      const [users] = await conn.execute<(RowDataPacket & { email: string })[]>(
        "SELECT email FROM users WHERE id = ? FOR UPDATE",
        [id],
      );
      if (!users[0]) throw new AdminUserDeletionError("NOT_FOUND");

      const [tables] = await conn.execute<(RowDataPacket & { tableName: string })[]>(
        "SELECT TABLE_NAME AS tableName FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'",
      );
      const available = new Set(tables.map((row) => row.tableName));

      if (available.has("cep_devices")) {
        for (const table of ["cep_device_active_packs", "cep_device_installs"]) {
          if (!available.has(table)) continue;
          await conn.execute(
            `DELETE child FROM \`${table}\` child JOIN cep_devices device ON device.id = child.device_id WHERE device.user_id = ?`,
            [id],
          );
        }
      }

      for (const table of [
        "cep_auth_sessions",
        "cep_client_sessions",
        "cep_error_reports",
        "cep_devices",
        "sessions",
        "user_favorites",
        "user_generation_credits",
      ]) {
        if (!available.has(table)) continue;
        await conn.execute(`DELETE FROM \`${table}\` WHERE user_id = ?`, [id]);
      }

      if (available.has("user_followings")) {
        await conn.execute(
          "DELETE FROM user_followings WHERE user_id = ? OR following_id = ?",
          [id, id],
        );
      }

      for (const table of ["password_reset_tokens", "password_resets", "email_verification_tokens"]) {
        if (!available.has(table)) continue;
        await conn.execute(`DELETE FROM \`${table}\` WHERE email = ?`, [users[0].email]);
      }

      const [result] = await conn.execute<ResultSetHeader>(
        "DELETE FROM users WHERE id = ?",
        [id],
      );
      if (result.affectedRows !== 1) throw new AdminUserDeletionError("NOT_FOUND");
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    }
  });
}
