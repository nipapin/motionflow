import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { getMarketItemsByIds } from "@/lib/market-items";
import type { Product } from "@/lib/product-types";

const TABLE = "sold_items";

export interface PurchaseRow {
  id: number;
  itemId: number;
  soldPrice: number;
  license: number;
  purchaseCode: string | null;
  system: string;
  createdAt: string | null;
}

type SoldRow = RowDataPacket & {
  id: number;
  item_id: number;
  sold_price: number;
  license: number;
  purchase_code: string | null;
  system: string;
  created_at: string | null;
};

export interface PurchaseWithProduct extends PurchaseRow {
  product: Product | null;
}

export async function getPurchasesForUser(userId: number): Promise<PurchaseWithProduct[]> {
  const pool = getPool();
  const [rows] = await pool.execute<SoldRow[]>(
    `SELECT id, item_id, sold_price, license, purchase_code, \`system\`, created_at
     FROM \`${TABLE}\`
     WHERE buyer_id = ? AND status = 1
     ORDER BY id DESC`,
    [userId],
  );

  const purchases: PurchaseRow[] = rows.map((r) => ({
    id: Number(r.id),
    itemId: Number(r.item_id),
    soldPrice: Number(r.sold_price),
    license: Number(r.license),
    purchaseCode: r.purchase_code ?? null,
    system: String(r.system ?? ""),
    createdAt: r.created_at ? String(r.created_at) : null,
  }));

  const ids = [...new Set(purchases.map((p) => p.itemId))];
  const products = await getMarketItemsByIds(ids);
  const byId = new Map(products.map((p) => [p.id, p]));

  return purchases.map((p) => ({
    ...p,
    product: byId.get(p.itemId) ?? null,
  }));
}

/** One-time purchase grants download for this item (sold_items row with status = 1). */
export async function userOwnsItem(userId: number, itemId: number): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT 1 FROM \`${TABLE}\` WHERE buyer_id = ? AND item_id = ? AND status = 1 LIMIT 1`,
    [userId, itemId],
  );
  return rows.length > 0;
}
