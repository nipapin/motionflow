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

const LIMIT = 200;

export async function getDownloadsForUser(userId: number): Promise<DownloadWithProduct[]> {
  const pool = getPool();
  const [rows] = await pool.execute<DlRow[]>(
    `SELECT id, item_id, purchase_code, created_at
     FROM \`${TABLE}\`
     WHERE user_id = ?
     ORDER BY id DESC
     LIMIT ?`,
    [userId, LIMIT],
  );

  const downloads: DownloadRow[] = rows.map((r) => ({
    id: Number(r.id),
    itemId: Number(r.item_id),
    purchaseCode: r.purchase_code ?? null,
    createdAt: r.created_at ? String(r.created_at) : null,
  }));

  const ids = [...new Set(downloads.map((d) => d.itemId))];
  const products = await getMarketItemsByIds(ids);
  const byId = new Map(products.map((p) => [p.id, p]));

  return downloads.map((d) => ({
    ...d,
    product: byId.get(d.itemId) ?? null,
  }));
}
