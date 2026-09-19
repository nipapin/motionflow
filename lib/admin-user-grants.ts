import "server-only";

import crypto from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { marketplaceItemsTable } from "@/lib/author/marketplace-table";
import { getMarketItemsByIds } from "@/lib/market-items";
import { EXTRA_GEN_PACKS } from "@/lib/extra-generation-packs";
import {
  grantAdminAuthorSubscription,
  type AdminGrantDuration,
} from "@/lib/admin-author-grants";
import { PREMIERE_GAL_AUTHOR_ID } from "@/lib/premiere-gal-paddle-config";
import { SPUNKRAM_AUTHOR_ID } from "@/lib/spunkram-paddle-config";
import type { AdminUserGrantSubscriptionInput } from "@/lib/validations/admin-users";
import type {
  AdminMarketItemHit,
  AdminUserPurchaseRow,
  AdminUserSubscriptionRow,
} from "@/lib/admin-users-shared";

const SOLD_TABLE = "sold_items";
const SUB_TABLE = "subscription_systems";
const ADMIN_SYSTEM = "admin";
const THIRD_PARTY_AUTHOR_IDS = [SPUNKRAM_AUTHOR_ID, PREMIERE_GAL_AUTHOR_ID] as const;

export class AdminUserGrantError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "AdminUserGrantError";
  }
}

function adminPaymentId(): string {
  return `admin_${crypto.randomUUID().replace(/-/g, "")}`;
}

function generatePurchaseCode(
  itemId: number,
  buyerId: number,
  paymentId: string,
): string {
  return crypto
    .createHash("md5")
    .update(`order${itemId}${buyerId}${paymentId}`)
    .digest("hex");
}

function likeContains(q: string): string {
  return `%${q.replace(/[\\%_]/g, "\\$&")}%`;
}

function toIso(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toMysqlDateTime(d: Date | null): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function endsAtForDuration(duration: AdminGrantDuration): Date | null {
  if (duration === "until_revoked") return null;
  const d = new Date();
  if (duration === "1_month") {
    d.setUTCMonth(d.getUTCMonth() + 1);
    return d;
  }
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d;
}

function extraGenPriceIds(): string[] {
  return EXTRA_GEN_PACKS.map((p) => p.priceId).filter(
    (id): id is string => Boolean(id),
  );
}

function motionflowCatalog(opts: {
  tier: "creator" | "creator_ai";
  duration: AdminGrantDuration;
}): { priceId: string; productName: string; plan: "monthly" | "annual" } {
  const useYearly = opts.duration !== "1_month";
  if (opts.tier === "creator_ai") {
    const priceId = useYearly
      ? process.env.NEXT_PUBLIC_PADDLE_PRICE_CREATOR_AI_YEARLY?.trim() ?? ""
      : process.env.NEXT_PUBLIC_PADDLE_PRICE_CREATOR_AI_MONTHLY?.trim() ?? "";
    return {
      priceId,
      productName: "Creator + AI",
      plan: useYearly ? "annual" : "monthly",
    };
  }
  const priceId = useYearly
    ? process.env.NEXT_PUBLIC_PADDLE_PRICE_CREATOR_YEARLY?.trim() ?? ""
    : process.env.NEXT_PUBLIC_PADDLE_PRICE_CREATOR_MONTHLY?.trim() ?? "";
  return {
    priceId,
    productName: "Creator",
    plan: useYearly ? "annual" : "monthly",
  };
}

function subscriptionLabel(row: {
  author_id: number | null;
  paddle_product_name: string | null;
  plan: string | null;
}): string {
  const authorId = row.author_id == null ? null : Number(row.author_id);
  if (authorId === SPUNKRAM_AUTHOR_ID) {
    return row.paddle_product_name?.trim() || "Spunkram";
  }
  if (authorId === PREMIERE_GAL_AUTHOR_ID) {
    return row.paddle_product_name?.trim() || "Premiere Gal";
  }
  const name = row.paddle_product_name?.trim();
  if (name) return name.startsWith("Motionflow") ? name : `Motionflow ${name}`;
  if (row.plan) return `Motionflow (${row.plan})`;
  return "Motionflow";
}

export async function listAdminUserPurchases(
  userId: number,
): Promise<AdminUserPurchaseRow[]> {
  const pool = getPool();
  type Row = RowDataPacket & {
    id: number;
    item_id: number;
    author_id: number;
    status: number;
    system: string | null;
    purchase_code: string | null;
    sold_price: number | null;
    created_at: string | Date | null;
  };
  const [rows] = await pool.execute<Row[]>(
    `SELECT id, item_id, author_id, status, \`system\`, purchase_code, sold_price, created_at
       FROM \`${SOLD_TABLE}\`
      WHERE buyer_id = ?
      ORDER BY id DESC`,
    [userId],
  );
  const itemIds = [...new Set(rows.map((r) => Number(r.item_id)))];
  const products = await getMarketItemsByIds(itemIds);
  const byId = new Map(products.map((p) => [p.id, p]));
  return rows.map((r) => ({
    id: Number(r.id),
    itemId: Number(r.item_id),
    itemName: byId.get(Number(r.item_id))?.name ?? null,
    authorId: Number(r.author_id),
    status: Number(r.status),
    system: String(r.system ?? ""),
    purchaseCode: r.purchase_code ? String(r.purchase_code) : null,
    soldPrice: Number(r.sold_price ?? 0),
    createdAt: toIso(r.created_at),
  }));
}

export async function listAdminUserSubscriptions(
  userId: number,
): Promise<AdminUserSubscriptionRow[]> {
  const pool = getPool();
  type Row = RowDataPacket & {
    id: number;
    author_id: number | null;
    status: number;
    plan: string | null;
    system: string | null;
    subscription_id: string;
    payment_id: string | null;
    paddle_product_name: string | null;
    paddle_price_id: string | null;
    ends_at: string | Date | null;
    paddle_billing_period_ends_at: string | Date | null;
    created_at: string | Date | null;
  };
  const [rows] = await pool.execute<Row[]>(
    `SELECT id, author_id, status, plan, \`system\`, subscription_id, payment_id,
            paddle_product_name, paddle_price_id, ends_at,
            paddle_billing_period_ends_at, created_at
       FROM \`${SUB_TABLE}\`
      WHERE buyer_id = ?
      ORDER BY id DESC`,
    [userId],
  );
  return rows.map((r) => {
    const endsAt = toIso(r.paddle_billing_period_ends_at) ?? toIso(r.ends_at);
    return {
      id: Number(r.id),
      authorId: r.author_id == null ? null : Number(r.author_id),
      status: Number(r.status),
      plan: r.plan ? String(r.plan) : null,
      system: String(r.system ?? ""),
      subscriptionId: String(r.subscription_id ?? ""),
      paymentId: r.payment_id ? String(r.payment_id) : null,
      paddleProductName: r.paddle_product_name ? String(r.paddle_product_name) : null,
      paddlePriceId: r.paddle_price_id ? String(r.paddle_price_id) : null,
      endsAt,
      createdAt: toIso(r.created_at),
      label: subscriptionLabel(r),
    };
  });
}

export async function searchAdminMarketItems(
  q: string,
  limit = 20,
): Promise<AdminMarketItemHit[]> {
  const query = q.trim();
  if (query.length < 1) return [];
  const capped = Math.min(40, Math.max(1, limit));
  const pool = getPool();
  const table = marketplaceItemsTable();
  const asId = Number(query);
  const isNumericId = /^\d+$/.test(query) && Number.isFinite(asId) && asId > 0;
  const contains = likeContains(query);

  type Row = RowDataPacket & {
    id: number;
    name: string;
    author_id: number;
    price: number | null;
    index_category_slug: string | null;
  };
  const [rows] = await pool.execute<Row[]>(
    `SELECT id, name, author_id, price, index_category_slug
       FROM \`${table}\`
      WHERE deleted_at IS NULL
        AND (
          ${isNumericId ? "id = ? OR" : ""}
          name LIKE ? ESCAPE '\\\\'
          OR index_category_slug LIKE ? ESCAPE '\\\\'
          OR tags LIKE ? ESCAPE '\\\\'
        )
      ORDER BY
        CASE WHEN id = ? THEN 0 ELSE 1 END,
        id DESC
      LIMIT ${capped}`,
    [
      ...(isNumericId ? [asId] : []),
      contains,
      contains,
      contains,
      isNumericId ? asId : -1,
    ],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name ?? ""),
    authorId: Number(r.author_id),
    price: Number(r.price ?? 0),
    slug: String(r.index_category_slug ?? ""),
  }));
}

async function deactivateOtherMotionflowCatalogRows(opts: {
  userId: number;
  keepRowId?: number | null;
}): Promise<void> {
  const pool = getPool();
  const extraIds = extraGenPriceIds();
  const thirdParty = [...THIRD_PARTY_AUTHOR_IDS];
  const extraClause =
    extraIds.length > 0
      ? `AND (paddle_price_id IS NULL OR paddle_price_id NOT IN (${extraIds.map(() => "?").join(",")}))`
      : "";
  const keepClause = opts.keepRowId ? "AND id != ?" : "";
  await pool.execute(
    `UPDATE \`${SUB_TABLE}\`
        SET status = 0, updated_at = NOW()
      WHERE buyer_id = ?
        AND status IN (1, -1)
        AND (author_id IS NULL OR author_id NOT IN (${thirdParty.map(() => "?").join(",")}))
        ${extraClause}
        ${keepClause}`,
    [
      opts.userId,
      ...thirdParty,
      ...extraIds,
      ...(opts.keepRowId ? [opts.keepRowId] : []),
    ],
  );
}

async function grantMotionflowSubscription(opts: {
  userId: number;
  tier: "creator" | "creator_ai";
  duration: AdminGrantDuration;
}): Promise<{ subscriptionId: string; updated: boolean }> {
  const catalog = motionflowCatalog(opts);
  const endsAt = toMysqlDateTime(endsAtForDuration(opts.duration));
  const pool = getPool();
  const extraIds = extraGenPriceIds();
  const extraClause =
    extraIds.length > 0
      ? `AND (paddle_price_id IS NULL OR paddle_price_id NOT IN (${extraIds.map(() => "?").join(",")}))`
      : "";

  type Existing = RowDataPacket & { id: number; subscription_id: string };
  const [existing] = await pool.execute<Existing[]>(
    `SELECT id, subscription_id FROM \`${SUB_TABLE}\`
      WHERE buyer_id = ?
        AND \`system\` = ?
        AND (author_id IS NULL OR author_id NOT IN (?, ?))
        ${extraClause}
      ORDER BY id DESC
      LIMIT 1`,
    [opts.userId, ADMIN_SYSTEM, SPUNKRAM_AUTHOR_ID, PREMIERE_GAL_AUTHOR_ID, ...extraIds],
  );

  const keepId = existing[0] ? Number(existing[0].id) : null;
  await deactivateOtherMotionflowCatalogRows({
    userId: opts.userId,
    keepRowId: keepId,
  });

  if (existing[0]) {
    await pool.execute(
      `UPDATE \`${SUB_TABLE}\`
          SET status = 1,
              plan = ?,
              paddle_price_id = ?,
              paddle_product_name = ?,
              ends_at = ?,
              paddle_billing_period_ends_at = ?,
              author_id = NULL,
              updated_at = NOW()
        WHERE id = ?`,
      [
        catalog.plan,
        catalog.priceId || null,
        catalog.productName,
        endsAt,
        endsAt,
        existing[0].id,
      ],
    );
    return {
      subscriptionId: String(existing[0].subscription_id),
      updated: true,
    };
  }

  const paymentId = adminPaymentId();
  await pool.execute(
    `INSERT INTO \`${SUB_TABLE}\`
       (buyer_id, subscription_id, payment_id, status,
        amount, amount_summary, price, system_tax,
        \`system\`, type, plan, paddle_price_id, paddle_product_name,
        count, ends_at, paddle_billing_period_ends_at,
        author_id, author_earn, created_at, updated_at)
     VALUES (?, ?, ?, 1, 0, 0, 0, 0, ?, 'personal', ?, ?, ?, 1, ?, ?, NULL, 0, NOW(), NOW())`,
    [
      opts.userId,
      paymentId,
      paymentId,
      ADMIN_SYSTEM,
      catalog.plan,
      catalog.priceId || null,
      catalog.productName,
      endsAt,
      endsAt,
    ],
  );
  return { subscriptionId: paymentId, updated: false };
}

export async function grantAdminUserSubscription(opts: {
  userId: number;
  grant: AdminUserGrantSubscriptionInput;
}): Promise<{ subscriptionId: string; updated: boolean }> {
  if (opts.grant.kind === "motionflow") {
    return grantMotionflowSubscription({
      userId: opts.userId,
      tier: opts.grant.tier,
      duration: opts.grant.duration,
    });
  }
  if (opts.grant.kind === "spunkram") {
    return grantAdminAuthorSubscription({
      userId: opts.userId,
      authorId: SPUNKRAM_AUTHOR_ID,
      grant: {
        kind: "spunkram",
        tier: opts.grant.tier,
        duration: opts.grant.duration,
      },
    });
  }
  return grantAdminAuthorSubscription({
    userId: opts.userId,
    authorId: PREMIERE_GAL_AUTHOR_ID,
    grant: { kind: "premiere_gal", plan: opts.grant.plan },
  });
}

export async function revokeAdminUserSubscription(opts: {
  userId: number;
  rowId: number;
}): Promise<{ revoked: boolean; system: string | null }> {
  const pool = getPool();
  type Row = RowDataPacket & { id: number; system: string | null; status: number };
  const [rows] = await pool.execute<Row[]>(
    `SELECT id, \`system\`, status FROM \`${SUB_TABLE}\`
      WHERE id = ? AND buyer_id = ? LIMIT 1`,
    [opts.rowId, opts.userId],
  );
  const row = rows[0];
  if (!row) throw new AdminUserGrantError("Subscription not found", "NOT_FOUND");
  if (Number(row.status) === 0) {
    return { revoked: false, system: row.system ? String(row.system) : null };
  }
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE \`${SUB_TABLE}\`
        SET status = 0, updated_at = NOW()
      WHERE id = ? AND buyer_id = ? AND status IN (1, -1)`,
    [opts.rowId, opts.userId],
  );
  return {
    revoked: (result.affectedRows ?? 0) > 0,
    system: row.system ? String(row.system) : null,
  };
}

export async function grantAdminUserPurchase(opts: {
  userId: number;
  itemId: number;
  adminUserId: number;
}): Promise<{ soldItemId: number; restored: boolean; skipped: boolean }> {
  const products = await getMarketItemsByIds([opts.itemId]);
  const product = products[0];
  if (!product) {
    throw new AdminUserGrantError("Item not found", "ITEM_NOT_FOUND");
  }

  const pool = getPool();
  type SoldRow = RowDataPacket & {
    id: number;
    status: number;
    system: string | null;
  };
  const [existing] = await pool.execute<SoldRow[]>(
    `SELECT id, status, \`system\` FROM \`${SOLD_TABLE}\`
      WHERE buyer_id = ? AND item_id = ?
      ORDER BY id DESC`,
    [opts.userId, opts.itemId],
  );
  const active = existing.find((r) => Number(r.status) === 1);
  if (active) {
    return { soldItemId: Number(active.id), restored: false, skipped: true };
  }
  const revokedAdmin = existing.find(
    (r) => Number(r.status) === 0 && String(r.system ?? "") === ADMIN_SYSTEM,
  );
  if (revokedAdmin) {
    await pool.execute(
      `UPDATE \`${SOLD_TABLE}\`
          SET status = 1, updated_at = NOW()
        WHERE id = ? AND buyer_id = ?`,
      [revokedAdmin.id, opts.userId],
    );
    return { soldItemId: Number(revokedAdmin.id), restored: true, skipped: false };
  }

  const paymentId = adminPaymentId();
  const purchaseCode = generatePurchaseCode(opts.itemId, opts.userId, paymentId);
  const [ins] = await pool.execute<ResultSetHeader>(
    `INSERT INTO \`${SOLD_TABLE}\`
       (buyer_id, author_id, item_id, status, payment_id,
        sold_price, sold_summary, sold_net, license, qty, \`system\`, system_tax,
        arguments, platform_earn, purchase_code, author_earn,
        created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, 0, 0, 0, 1, 1, ?, 0, ?, 0, ?, 0, NOW(), NOW())`,
    [
      opts.userId,
      product.author_id,
      opts.itemId,
      paymentId,
      ADMIN_SYSTEM,
      JSON.stringify({
        source: "admin_grant",
        admin_user_id: opts.adminUserId,
      }),
      purchaseCode,
    ],
  );
  return { soldItemId: Number(ins.insertId), restored: false, skipped: false };
}

export async function revokeAdminUserPurchase(opts: {
  userId: number;
  soldId: number;
}): Promise<{ revoked: boolean; system: string | null }> {
  const pool = getPool();
  type Row = RowDataPacket & { id: number; system: string | null; status: number };
  const [rows] = await pool.execute<Row[]>(
    `SELECT id, \`system\`, status FROM \`${SOLD_TABLE}\`
      WHERE id = ? AND buyer_id = ? LIMIT 1`,
    [opts.soldId, opts.userId],
  );
  const row = rows[0];
  if (!row) throw new AdminUserGrantError("Purchase not found", "NOT_FOUND");
  if (Number(row.status) === 0) {
    return { revoked: false, system: row.system ? String(row.system) : null };
  }
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE \`${SOLD_TABLE}\`
        SET status = 0, updated_at = NOW()
      WHERE id = ? AND buyer_id = ? AND status = 1`,
    [opts.soldId, opts.userId],
  );
  return {
    revoked: (result.affectedRows ?? 0) > 0,
    system: row.system ? String(row.system) : null,
  };
}

export async function restoreAdminUserPurchase(opts: {
  userId: number;
  soldId: number;
}): Promise<{ restored: boolean }> {
  const pool = getPool();
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE \`${SOLD_TABLE}\`
        SET status = 1, updated_at = NOW()
      WHERE id = ? AND buyer_id = ? AND status = 0`,
    [opts.soldId, opts.userId],
  );
  return { restored: (result.affectedRows ?? 0) > 0 };
}

export async function restoreAdminUserSubscription(opts: {
  userId: number;
  rowId: number;
}): Promise<{ restored: boolean }> {
  const pool = getPool();
  type Row = RowDataPacket & { id: number; author_id: number | null };
  const [rows] = await pool.execute<Row[]>(
    `SELECT id, author_id FROM \`${SUB_TABLE}\` WHERE id = ? AND buyer_id = ? LIMIT 1`,
    [opts.rowId, opts.userId],
  );
  const row = rows[0];
  if (!row) throw new AdminUserGrantError("Subscription not found", "NOT_FOUND");
  const authorId = row.author_id == null ? null : Number(row.author_id);
  const isCatalog =
    authorId == null ||
    (authorId !== SPUNKRAM_AUTHOR_ID && authorId !== PREMIERE_GAL_AUTHOR_ID);
  if (isCatalog) {
    await deactivateOtherMotionflowCatalogRows({
      userId: opts.userId,
      keepRowId: Number(row.id),
    });
  }
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE \`${SUB_TABLE}\`
        SET status = 1, updated_at = NOW()
      WHERE id = ? AND buyer_id = ? AND status = 0`,
    [opts.rowId, opts.userId],
  );
  return { restored: (result.affectedRows ?? 0) > 0 };
}
