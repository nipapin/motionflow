import "server-only";

import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";

let schemaReady: Promise<void> | undefined;

export function ensureWebSessionSchema(): Promise<void> {
  schemaReady ??= getPool().query("SELECT version FROM user_web_session_versions LIMIT 0").catch(async (error) => {
    if (error.code !== "ER_NO_SUCH_TABLE") throw error;
    await getPool().query(`CREATE TABLE IF NOT EXISTS user_web_session_versions (
      user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      version INT UNSIGNED NOT NULL DEFAULT 0
    ) ENGINE=InnoDB`);
  }).then(() => {}).catch((error) => {
    schemaReady = undefined;
    throw error;
  });
  return schemaReady;
}

/** Missing claims/rows represent sessions issued before revocation was introduced. */
export async function getWebSessionVersion(userId: number, connection?: PoolConnection): Promise<number> {
  await ensureWebSessionSchema();
  const [rows] = await (connection ?? getPool()).execute<(RowDataPacket & { version: number })[]>(
    "SELECT version FROM user_web_session_versions WHERE user_id = ?",
    [userId],
  );
  return Number(rows[0]?.version ?? 0);
}

/** Call inside the password transaction, after locking the user's row. */
export async function advanceWebSessionVersion(connection: PoolConnection, userId: number): Promise<number> {
  await connection.execute(
    `INSERT INTO user_web_session_versions (user_id, version) VALUES (?, 1)
     ON DUPLICATE KEY UPDATE version = version + 1`,
    [userId],
  );
  return getWebSessionVersion(userId, connection);
}
