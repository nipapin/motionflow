import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { getMarketItemsByIds } from "@/lib/market-items";
import type { Product } from "@/lib/product-types";

const TABLE = "subscription_downloads";

export interface DownloadRow {
  id: number;
  itemId: number;
  createdAt: string | null;
}

type DlRow = RowDataPacket & {
  id: number;
  item_id: number;
  created_at: string | null;
};

export interface DownloadWithProduct extends DownloadRow {
  product: Product | null;
}

export type DownloadsForUserResult = {
  items: DownloadWithProduct[];
  /** True when the downloads query failed (e.g. missing table); `items` is empty. */
  queryFailed: boolean;
};

/** Max rows; must be inlined in SQL — `LIMIT ?` with `pool.execute()` triggers ER_WRONG_ARGUMENTS on some MySQL/MariaDB builds. */
const DOWNLOAD_LIST_LIMIT = 200;

export async function getDownloadsForUser(userId: number): Promise<DownloadsForUserResult> {
  try {
    const pool = getPool();
    const [rows] = await pool.execute<DlRow[]>(
      `SELECT sd.id, sd.item_id, sd.created_at
       FROM \`${TABLE}\` sd
       INNER JOIN (
         SELECT item_id, MAX(id) AS mid
         FROM \`${TABLE}\`
         WHERE user_id = ?
         GROUP BY item_id
       ) latest ON latest.item_id = sd.item_id AND latest.mid = sd.id
       WHERE sd.user_id = ?
       ORDER BY sd.id DESC
       LIMIT ${DOWNLOAD_LIST_LIMIT}`,
      [userId, userId],
    );

    const downloads: DownloadRow[] = rows.map((r) => ({
      id: Number(r.id),
      itemId: Number(r.item_id),
      createdAt: r.created_at ? String(r.created_at) : null,
    }));

    const ids = [...new Set(downloads.map((d) => d.itemId))];
    const products = await getMarketItemsByIds(ids);
    const byId = new Map(products.map((p) => [p.id, p]));

    const items = downloads.map((d) => ({
      ...d,
      product: byId.get(d.itemId) ?? null,
    }));
    return { items, queryFailed: false };
  } catch (err) {
    console.error("[getDownloadsForUser] MySQL query failed:", err);
    return { items: [], queryFailed: true };
  }
}
