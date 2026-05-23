import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { EXTRA_GEN_PACKS } from "@/lib/extra-generation-packs";
import { getPool } from "@/lib/db";
import { getMarketItemsByIds } from "@/lib/market-items";
import type { Product } from "@/lib/product-types";

const TABLE = "sold_items";
const EXTRA_GEN_CREDIT_EVENTS_TABLE = "paddle_extra_generation_credit_events";

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

export interface ExtraGenerationCreditPurchase {
  paddleTransactionId: string;
  generations: number;
  createdAt: string | null;
}

type ExtraCreditRow = RowDataPacket & {
  paddle_transaction_id: string;
  generations: number;
  created_at: string | null;
};

/** Paddle-settled extra AI generation packs (see `paddle-server` + credit events table). */
export async function getExtraGenerationCreditPurchasesForUser(
  userId: number,
): Promise<ExtraGenerationCreditPurchase[]> {
  const pool = getPool();
  const [rows] = await pool.execute<ExtraCreditRow[]>(
    `SELECT paddle_transaction_id, generations, created_at
       FROM \`${EXTRA_GEN_CREDIT_EVENTS_TABLE}\`
      WHERE user_id = ?
      ORDER BY created_at DESC, paddle_transaction_id DESC`,
    [userId],
  );
  return rows.map((r) => ({
    paddleTransactionId: String(r.paddle_transaction_id),
    generations: Number(r.generations),
    createdAt: r.created_at ? String(r.created_at) : null,
  }));
}

type LegacyPackRow = RowDataPacket & {
  subscription_id: string;
  paddle_price_id: string | null;
  created_at: string | null;
};

/**
 * Older checkouts only wrote `subscription_systems` rows for extra-gen packs.
 * Shown on My purchases until/unless mirrored in `paddle_extra_generation_credit_events`.
 */
export async function getLegacyExtraGenPackRowsFromSubscriptionSystems(
  userId: number,
): Promise<ExtraGenerationCreditPurchase[]> {
  const packIds = EXTRA_GEN_PACKS.map((p) => p.priceId).filter((id): id is string => Boolean(id));
  if (packIds.length === 0) return [];
  const pool = getPool();
  const ph = packIds.map(() => "?").join(", ");
  const [rows] = await pool.execute<LegacyPackRow[]>(
    `SELECT subscription_id, paddle_price_id, created_at
       FROM \`subscription_systems\`
      WHERE buyer_id = ?
        AND paddle_price_id IN (${ph})
      ORDER BY id DESC`,
    [userId, ...packIds],
  );
  const out: ExtraGenerationCreditPurchase[] = [];
  for (const r of rows) {
    const priceId = r.paddle_price_id?.trim() ?? "";
    const pack = EXTRA_GEN_PACKS.find((p) => p.priceId === priceId);
    if (!pack) continue;
    out.push({
      paddleTransactionId: String(r.subscription_id),
      generations: pack.count,
      createdAt: r.created_at ? String(r.created_at) : null,
    });
  }
  return out;
}

/** Credit ledger + legacy subscription rows, one entry per Paddle transaction id. */
export async function getProfileExtraGenerationPurchases(
  userId: number,
): Promise<ExtraGenerationCreditPurchase[]> {
  let fromEvents: ExtraGenerationCreditPurchase[] = [];
  try {
    fromEvents = await getExtraGenerationCreditPurchasesForUser(userId);
  } catch (err) {
    console.warn("[purchases] extra generation credit events unavailable:", err);
  }
  const fromLegacy = await getLegacyExtraGenPackRowsFromSubscriptionSystems(userId);
  const map = new Map<string, ExtraGenerationCreditPurchase>();
  for (const r of fromLegacy) map.set(r.paddleTransactionId, r);
  for (const r of fromEvents) map.set(r.paddleTransactionId, r);
  return [...map.values()].sort(
    (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
  );
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

/** Purchase code for one-time buys — required by the main site download endpoint. */
export async function getPurchaseCodeForOwnedItem(
  userId: number,
  itemId: number,
): Promise<string | null> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT purchase_code FROM \`${TABLE}\`
     WHERE buyer_id = ? AND item_id = ? AND status = 1
     ORDER BY id DESC
     LIMIT 1`,
    [userId, itemId],
  );
  const r = rows[0] as { purchase_code?: string | null } | undefined;
  const raw = r?.purchase_code;
  if (raw == null || String(raw).trim() === "") return null;
  return String(raw);
}
