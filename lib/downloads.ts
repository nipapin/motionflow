import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { getMarketItemsByIds } from "@/lib/market-items";
import type { Product } from "@/lib/product-types";

const TABLE = "subscription_downloads";

export interface DownloadRow {
  id: number;
  itemId: number;
  purchaseCode: string | null;
  createdAt: string | null;
}

type DlRow = RowDataPacket & {
  id: number;
  item_id: number;
  purchase_code: string | null;
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
      `SELECT id, item_id, purchase_code, created_at
       FROM \`${TABLE}\`
       WHERE user_id = ?
       ORDER BY id DESC
       LIMIT ${DOWNLOAD_LIST_LIMIT}`,
      [userId],
    );

    const downloads: DownloadRow[] = rows.map((r) => ({
      id: Number(r.id),
      itemId: Number(r.item_id),
      purchaseCode:
        r.purchase_code != null && r.purchase_code !== "" ? String(r.purchase_code) : null,
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
