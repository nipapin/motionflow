import "server-only";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { getPool } from "@/lib/db";

const TABLE = "user_favorites";

export async function getFavoriteItemIds(userId: number): Promise<number[]> {
  const pool = getPool();
  const [rows] = await pool.execute<(RowDataPacket & { item_id: number })[]>(
    `SELECT item_id FROM \`${TABLE}\` WHERE user_id = ? ORDER BY id DESC`,
    [userId],
  );
  return rows.map((r) => r.item_id);
}

export async function isFavorite(userId: number, itemId: number): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT 1 FROM \`${TABLE}\` WHERE user_id = ? AND item_id = ? LIMIT 1`,
    [userId, itemId],
  );
  return rows.length > 0;
}

export async function addFavorite(userId: number, itemId: number): Promise<void> {
  const pool = getPool();
  await pool.execute<ResultSetHeader>(
    `INSERT IGNORE INTO \`${TABLE}\` (user_id, item_id, created_at, updated_at) VALUES (?, ?, NOW(), NOW())`,
    [userId, itemId],
  );
}

export async function removeFavorite(userId: number, itemId: number): Promise<void> {
  const pool = getPool();
  await pool.execute<ResultSetHeader>(
    `DELETE FROM \`${TABLE}\` WHERE user_id = ? AND item_id = ?`,
    [userId, itemId],
  );
}

/**
 * Toggle favorite. Returns the new state (`true` = added, `false` = removed).
 */
export async function toggleFavorite(userId: number, itemId: number): Promise<boolean> {
  if (await isFavorite(userId, itemId)) {
    await removeFavorite(userId, itemId);
    return false;
  }
  await addFavorite(userId, itemId);
  return true;
}
