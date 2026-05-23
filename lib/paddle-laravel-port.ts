import "server-only";
import crypto from "node:crypto";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";

/**
 * 1:1 port of the Laravel Aniom marketplace Paddle webhook logic.
 *
 * Reference files in the Laravel codebase:
 *   - app/Http/Controllers/Checkout/PaymentServices/GatewayPaddle.php
 *       - webhook()            — event router
 *       - handleSubscription() — subscription_systems INSERT/UPDATE
 *       - handleTransaction()  — sold_items INSERT (via succeedSale → addSoldItem)
 *       - calculateAuthorEarn() — net * 0.9 / 2
 *   - app/Models/SoldItems.php
 *       - addSoldItem()        — earnings split + balance increment
 *       - countingTaxes()      — platform vs author split
 *       - teamProjectRevenue() — co-author split
 *       - affiliateIncome()    — ref_earn split
 *       - handleCancellationPaymentPaddle() — refund
 *       - changeAuthorBalance() — users.balance increment/decrement
 *   - app/Models/SubscriptionSystem.php
 *       - createSubscription() — updateOrCreate by (buyer_id, subscription_id, author_id)
 *       - reverseAuthorBalancesForSubscriptionTermination()
 *   - app/Http/Abstracts/Payments/PaymentService.php
 *       - succeedSale()        — top-level shape of the prepare row
 *   - config/aniom.php
 *       - fixed_market_tax: { personal: 30, extended: 25 }
 *       - affiliate_profit_amount: 10
 *       - payment_gateway.transaction_tax: 5
 *
 * NOT ported (Motionflow-specific / Next.js-only paths):
 *   - extra_ai_generations credit-pack flow  → lives in paddle-server.ts
 *   - cancelOtherActiveSubscriptionsForBuyer → lives in paddle-server.ts
 *   - auto-resubscribe after scheduled downgrade → lives in paddle-server.ts
 *   - "unified_subscription / lifetime as subscription" branch from
 *     handleTransaction — requires the `subs_control.php` author config which
 *     is not in the Next.js project yet. Stubbed in a way that lets us turn
 *     it on later via env when the config is migrated.
 */

const SOLD_ITEMS_TABLE = "sold_items";
const SUBSCRIPTIONS_TABLE = "subscription_systems";
const MARKETPLACE_ITEMS_TABLE = process.env.DB_MARKET_ITEMS_TABLE ?? "marketplace_items";
const USERS_TABLE = "users";
const PAYMENT_SYSTEM = "paddle";

/** Port of `config/aniom.php` → `marketplace.fixed_market_tax`. Platform cut % per license type. */
const FIXED_MARKET_TAX = { personal: 30, extended: 25 } as const;

/** Port of `config/aniom.php` → `marketplace.affiliate_profit_amount`. % of `sold_net` paid to ref author. */
const AFFILIATE_PROFIT_AMOUNT = 10;

/** Paddle's transaction tax: 5% of the line total + a flat $0.50. From `config/aniom.php`. */
const PADDLE_TXN_TAX_PERCENT = 5;
const PADDLE_TXN_TAX_FLAT = 0.5;

/* -------------------------------------------------------------------------- */
/*  Math helpers — ports of the Laravel methods                                */
/* -------------------------------------------------------------------------- */

/**
 * Port of `SoldItems::countingTaxes`.
 *
 * ```php
 * $tax = $extraTax ? $extraTax : $fixedMarketTaxes[$licenseTaxType];
 * $setValWithTax = floatval(($amount / 100) * $tax);
 * return [
 *     'platform_earn' => $setValWithTax,
 *     'author_earn' => floatval($amount - $setValWithTax),
 * ];
 * ```
 */
function countingTaxes(
  amount: number,
  extraTax: number | null,
  licenseTaxType: "personal" | "extended",
): { platform_earn: number; author_earn: number } {
  const tax = extraTax && extraTax > 0 ? extraTax : FIXED_MARKET_TAX[licenseTaxType];
  const platformEarn = (amount / 100) * tax;
  return {
    platform_earn: platformEarn,
    author_earn: amount - platformEarn,
  };
}

/**
 * Port of `SoldItems::teamProjectRevenue`.
 *
 * ```php
 * $coAuthorEarn = floatval(($fullAmount / 100) * $coAuthorPercent);
 * return ['mainAuthor' => floatval($fullAmount - $coAuthorEarn), 'coAuthor' => $coAuthorEarn];
 * ```
 */
function teamProjectRevenue(
  fullAmount: number,
  coAuthorPercent: number,
): { mainAuthor: number; coAuthor: number } {
  const coAuthorEarn = (fullAmount / 100) * coAuthorPercent;
  return {
    mainAuthor: fullAmount - coAuthorEarn,
    coAuthor: coAuthorEarn,
  };
}

/**
 * Port of `GatewayPaddle::calculateAuthorEarn`.
 *
 * Net income minus 10% then halved → represents the author's share of a
 * subscription transaction. Mirrors:
 *
 * ```php
 * $afterTenPercent = $netIncome * (1 - 10 / 100);
 * return round($afterTenPercent / 2, $scale);
 * ```
 */
export function calculateAuthorEarnForSubscription(netIncome: number, scale = 2): number {
  const afterTenPercent = netIncome * (1 - 10 / 100);
  return round(afterTenPercent / 2, scale);
}

/**
 * Port of `SoldItems::addSoldItem` purchase code:
 *
 * ```php
 * $prepare['purchase_code'] = md5('order' . $prepare['item_id'] . $prepare['buyer_id'] . $prepare['payment_id']);
 * ```
 */
function generatePurchaseCode(itemId: number, buyerId: number, paymentId: string): string {
  return crypto
    .createHash("md5")
    .update(`order${itemId}${buyerId}${paymentId}`)
    .digest("hex");
}

function round(value: number, scale = 2): number {
  const mult = 10 ** scale;
  return Math.round(value * mult) / mult;
}

/**
 * Paddle delivers monetary amounts in minor units (cents) as decimal strings.
 * Major-unit conversion mirrors Laravel's `round($x / 100, 2)`.
 */
function minorToMajor(raw: string | number | null | undefined): number {
  if (raw == null) return 0;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  return round(n / 100, 2);
}

/* -------------------------------------------------------------------------- */
/*  Types — Paddle transaction shape (we only model the bits we read)          */
/* -------------------------------------------------------------------------- */

export interface LaravelPaddleItem {
  quantity?: number;
  price?: {
    id?: string;
    product_id?: string;
    name?: string | null;
    custom_data?: Record<string, unknown> | null;
    billing_cycle?: { interval?: string; frequency?: number } | null;
    unit_price?: { amount?: string | null; currency_code?: string | null } | null;
  } | null;
  trial_dates?: { starts_at: string | null; ends_at: string | null } | null;
}

interface LaravelPaddleLineItem {
  id?: string;
  product?: {
    id?: string;
    name?: string | null;
    custom_data?: Record<string, unknown> | null;
  } | null;
  quantity?: number;
  totals?: { subtotal?: string | number; discount?: string | number; total?: string | number } | null;
  unit_totals?: { subtotal?: string | number; discount?: string | number; total?: string | number; tax?: string | number } | null;
}

export interface LaravelPaddleTransaction {
  id: string;
  status?: string;
  origin?: string | null;
  subscription_id?: string | null;
  customer_id?: string | null;
  currency_code?: string | null;
  custom_data?: Record<string, unknown> | null;
  items?: LaravelPaddleItem[];
  details?: {
    totals?: { subtotal?: string; tax?: string; total?: string; grand_total?: string; currency_code?: string } | null;
    line_items?: LaravelPaddleLineItem[];
  } | null;
  payments?: Array<{
    status?: string;
    method_details?: {
      type?: string;
      card?: { type?: string; last4?: string; cardholder_name?: string } | null;
    } | null;
  }>;
  billing_period?: { starts_at?: string | null; ends_at?: string | null } | null;
  created_at?: string | null;
  billed_at?: string | null;
}

/* -------------------------------------------------------------------------- */
/*  Helpers to pull buyer / license / item id out of custom_data              */
/* -------------------------------------------------------------------------- */

function pickNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function pickBuyerId(cd: Record<string, unknown> | null | undefined): number | null {
  if (!cd) return null;
  return pickNumber(cd["buyer_id"]) ?? pickNumber(cd["userId"]);
}

/**
 * License resolution mirrors Laravel `handleTransaction`:
 *
 * ```php
 * $license = (string)($item['price']['custom_data']['license'] ?? '');
 * if ($license === '' && $itemId !== '') { $license = 1; }
 * ```
 *
 * Plus our Spunkram checkout puts the license on `transaction.custom_data`
 * (not on the price level), so we also accept it from there. We map
 * `personal` → 1 and `commercial` → 2 (the convention chosen for the
 * Next.js DB schema; Laravel originally used 1/3/10 — we keep that supported
 * as numeric pass-through for legacy compatibility).
 */
function pickLicense(
  txnCustomData: Record<string, unknown> | null | undefined,
  itemCustomData: Record<string, unknown> | null | undefined,
): number {
  const raw =
    itemCustomData?.["license"] ??
    txnCustomData?.["license"] ??
    null;
  if (raw == null || raw === "") return 1;
  const str = String(raw).trim().toLowerCase();
  if (str === "personal") return 1;
  if (str === "commercial" || str === "extended") return 2;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  return 1;
}

/**
 * `item_id` resolution. Laravel reads it from `line.product.custom_data.item_id`
 * (set on the Paddle product). Our Spunkram checkout puts it on
 * `transaction.custom_data.item_id` instead. Accept both.
 */
function pickItemId(
  txnCustomData: Record<string, unknown> | null | undefined,
  productCustomData: Record<string, unknown> | null | undefined,
): number | null {
  return (
    pickNumber(productCustomData?.["item_id"]) ??
    pickNumber(txnCustomData?.["item_id"]) ??
    pickNumber(txnCustomData?.["itemId"])
  );
}

/**
 * `author_id` for sold_items. Laravel reads `line.product.custom_data.author_id`.
 * If the Paddle product has no `custom_data` (typical for our Spunkram items
 * created via the marketplace), we fall back to `marketplace_items.author_id`.
 */
function pickAuthorIdFromProduct(
  productCustomData: Record<string, unknown> | null | undefined,
): number | null {
  return pickNumber(productCustomData?.["author_id"]);
}

interface TeamData {
  co_author_id: number;
  percent: number;
}

/**
 * `marketplace_items.team` is a JSON string `{"co_author_id": N, "percent": P}`.
 * Other shapes (PHP-serialised, missing percent) collapse to null.
 */
function parseTeamJson(raw: unknown): TeamData | null {
  if (raw == null || raw === "" || raw === "null") return null;
  const s = typeof raw === "string" ? raw : String(raw);
  try {
    const obj = JSON.parse(s) as Record<string, unknown>;
    if (!obj || typeof obj !== "object") return null;
    const coAuthorId = pickNumber(obj["co_author_id"]);
    const percentRaw = obj["percent"];
    const percent = percentRaw == null ? 0 : Number(percentRaw);
    if (!coAuthorId || !Number.isFinite(percent) || percent < 0) return null;
    return { co_author_id: coAuthorId, percent };
  } catch {
    return null;
  }
}

function pickPaymentMethod(payments: LaravelPaddleTransaction["payments"]): {
  type: string;
  last4: string | null;
  cardBrand: string | null;
} {
  const captured = payments?.find((p) => p.status === "captured") ?? payments?.[0];
  return {
    type: captured?.method_details?.type ?? "",
    last4: captured?.method_details?.card?.last4 ?? null,
    cardBrand: captured?.method_details?.card?.type ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/*  addSoldItem — port of Laravel `SoldItems::addSoldItem` + `succeedSale`     */
/* -------------------------------------------------------------------------- */

interface AddSoldItemResult {
  ok: boolean;
  soldItemId?: number;
  purchaseCode?: string;
  reason?: string;
}

/**
 * Inserts ONE row into `sold_items` for ONE Paddle transaction line item.
 *
 * Mirrors the inside of the `foreach ($getCollectionItems as $key)` loop in
 * `PaymentService::succeedSale` plus the entirety of `SoldItems::addSoldItem`:
 *
 *   1. Lookup `marketplace_items` for `author_id`, `team` (co-author JSON),
 *      `discount_*`, `price` — same as Laravel's `MarketplaceItem::whereIn(...)`.
 *   2. Lookup `users.extra_tax` for the author.
 *   3. Compute `cart_one_price` (per-unit), `cart_price` (with license * qty)
 *      — Laravel's `CartController::calculateCartAmount` with no coupon path.
 *   4. Compute `platform_earn` / `author_earn` via `countingTaxes`.
 *   5. If team JSON present → `teamProjectRevenue` split.
 *   6. If `ref_author_id` present → `affiliateIncome`.
 *   7. `purchase_code = md5("order" + item_id + buyer_id + payment_id)`.
 *   8. INSERT INTO `sold_items` + increment `users.balance`.
 *
 * Idempotency: Laravel uses `where($prepare)->exists()` which checks every
 * column. We use `(buyer_id, item_id, payment_id)` which is functionally
 * unique for our writer.
 */
export async function addSoldItemFromTransactionLine(params: {
  buyerId: number;
  itemId: number;
  paymentId: string;
  paymentMethod: string;
  paymentLast4: string | null;
  license: number;
  qty: number;
  /** Per-unit price for ONE license-unit (Laravel `cart_one_price`). */
  unitPrice: number;
  /** Subtotal for this entire line (Laravel `unitPrice` argument to succeedSale). */
  soldSummary: number;
  /** Net income = subtotal - discount - systemTax (Laravel `$fNetIncome`). */
  netIncome: number;
  systemTax: number;
  arguments_: Record<string, unknown>;
  refAuthorId?: number | null;
  refLinkId?: number | null;
  conn?: PoolConnection;
}): Promise<AddSoldItemResult> {
  const ownConn = !params.conn;
  const conn = params.conn ?? (await getPool().getConnection());

  try {
    // 1. Marketplace item → author_id, team JSON.
    interface MarketRow extends RowDataPacket {
      id: number;
      author_id: number | null;
      team: string | null;
    }
    const [miRows] = await conn.execute<MarketRow[]>(
      `SELECT id, author_id, team FROM \`${MARKETPLACE_ITEMS_TABLE}\` WHERE id = ? LIMIT 1`,
      [params.itemId],
    );
    const item = miRows[0];
    if (!item) {
      return { ok: false, reason: `marketplace_item_not_found:${params.itemId}` };
    }
    const authorId = Number(item.author_id);
    if (!Number.isFinite(authorId) || authorId <= 0) {
      return { ok: false, reason: `marketplace_item_author_invalid:${params.itemId}` };
    }

    // 2. users.extra_tax for the author (overrides the per-license market tax).
    interface UserRow extends RowDataPacket {
      extra_tax: number | string | null;
    }
    const [userRows] = await conn.execute<UserRow[]>(
      `SELECT extra_tax FROM \`${USERS_TABLE}\` WHERE id = ? LIMIT 1`,
      [authorId],
    );
    const extraTaxRaw = userRows[0]?.extra_tax;
    const authorExtraTax = extraTaxRaw == null ? null : Number(extraTaxRaw);

    // 3. Idempotency — short-circuit if the same line was already written.
    interface DupRow extends RowDataPacket {
      id: number;
      purchase_code: string;
    }
    const [dupRows] = await conn.execute<DupRow[]>(
      `SELECT id, purchase_code FROM \`${SOLD_ITEMS_TABLE}\`
        WHERE buyer_id = ? AND item_id = ? AND payment_id = ? LIMIT 1`,
      [params.buyerId, params.itemId, params.paymentId],
    );
    if (dupRows[0]) {
      return {
        ok: true,
        soldItemId: dupRows[0].id,
        purchaseCode: dupRows[0].purchase_code,
        reason: "sold_item_already_exists",
      };
    }

    // 4. Tax split.
    const licenseTaxType: "personal" | "extended" = params.license !== 1 ? "extended" : "personal";
    const taxes = countingTaxes(params.netIncome, authorExtraTax, licenseTaxType);

    const team = parseTeamJson(item.team);
    let authorEarn: number;
    let coAuthorId: number | null = null;
    let coPercent: number | null = null;
    let coEarn: number | null = null;
    let refEarn: number | null = null;
    let coRefEarn: number | null = null;

    if (team) {
      const split = teamProjectRevenue(taxes.author_earn, team.percent);
      authorEarn = split.mainAuthor;
      coAuthorId = team.co_author_id;
      coPercent = team.percent;
      coEarn = split.coAuthor;
    } else {
      authorEarn = taxes.author_earn;
    }

    // 5. Affiliate (only when ref_author_id is set on the transaction).
    if (params.refAuthorId != null) {
      const refRate = authorExtraTax ? AFFILIATE_PROFIT_AMOUNT / 2 : AFFILIATE_PROFIT_AMOUNT;
      const refEarnRaw = (params.netIncome / 100) * refRate;
      if (team) {
        if (params.refAuthorId === authorId || params.refAuthorId === team.co_author_id) {
          const refSplit = teamProjectRevenue(refEarnRaw, team.percent);
          if (params.refAuthorId === authorId) {
            refEarn = refSplit.mainAuthor;
            coRefEarn = refSplit.coAuthor;
          } else {
            // ref_author_id === co_author_id
            refEarn = refSplit.coAuthor;
            coRefEarn = refSplit.mainAuthor;
          }
          authorEarn += refEarn ?? 0;
          coEarn = (coEarn ?? 0) + (coRefEarn ?? 0);
        } else {
          // Referral is some other author → pay them out of band, no row-level ref_earn.
          if (params.refAuthorId > 0) {
            await incrementUserBalance(conn, params.refAuthorId, refEarnRaw);
          }
          refEarn = params.refAuthorId === 0 ? 0 : refEarnRaw;
        }
      } else {
        if (params.refAuthorId === authorId) {
          refEarn = refEarnRaw;
          authorEarn += refEarn;
        } else {
          if (params.refAuthorId > 0) {
            await incrementUserBalance(conn, params.refAuthorId, refEarnRaw);
          }
          refEarn = params.refAuthorId === 0 ? 0 : refEarnRaw;
        }
      }
    }

    const purchaseCode = generatePurchaseCode(params.itemId, params.buyerId, params.paymentId);

    // 6. INSERT.
    if (ownConn) await conn.beginTransaction();

    const insertCols = [
      "buyer_id",
      "author_id",
      "item_id",
      "status",
      "payment_id",
      "sold_price",
      "sold_summary",
      "sold_net",
      "license",
      "qty",
      "system",
      "system_tax",
      "arguments",
      "platform_earn",
      "purchase_code",
      "author_earn",
      "co_author_id",
      "co_percent",
      "co_earn",
      "ref_author_id",
      "ref_link_id",
      "ref_earn",
      "co_ref_earn",
      "created_at",
      "updated_at",
    ];

    const argumentsJson = JSON.stringify({
      items: [params.itemId],
      method: params.paymentMethod,
      last_signs: params.paymentLast4,
      ...params.arguments_,
    });

    const insertValues = [
      params.buyerId,
      authorId,
      params.itemId,
      1, // status = active
      params.paymentId,
      round(params.unitPrice, 2),
      round(params.soldSummary, 2),
      round(params.netIncome, 2),
      params.license,
      params.qty,
      PAYMENT_SYSTEM,
      round(params.systemTax, 2),
      argumentsJson,
      round(taxes.platform_earn, 2),
      purchaseCode,
      round(authorEarn, 2),
      coAuthorId,
      coPercent,
      coEarn == null ? null : round(coEarn, 2),
      params.refAuthorId ?? null,
      params.refLinkId ?? null,
      refEarn == null ? null : round(refEarn, 2),
      coRefEarn == null ? null : round(coRefEarn, 2),
    ];

    const placeholders = insertValues.map(() => "?").join(", ");
    const colSql = insertCols.map((c) => `\`${c}\``).join(", ");
    const [ins] = await conn.execute<ResultSetHeader>(
      `INSERT INTO \`${SOLD_ITEMS_TABLE}\` (${colSql}) VALUES (${placeholders}, NOW(), NOW())`,
      insertValues,
    );

    // 7. Balance increments.
    await incrementUserBalance(conn, authorId, round(authorEarn, 2));
    if (team && coAuthorId && coEarn != null) {
      await incrementUserBalance(conn, coAuthorId, round(coEarn, 2));
    }

    if (ownConn) await conn.commit();

    return {
      ok: true,
      soldItemId: ins.insertId,
      purchaseCode,
    };
  } catch (err) {
    if (ownConn) {
      try { await conn.rollback(); } catch { /* ignore */ }
    }
    throw err;
  } finally {
    if (ownConn) conn.release();
  }
}

async function incrementUserBalance(
  conn: PoolConnection,
  userId: number,
  amount: number,
): Promise<void> {
  if (!Number.isFinite(amount) || amount === 0) return;
  await conn.execute<ResultSetHeader>(
    `UPDATE \`${USERS_TABLE}\` SET \`balance\` = \`balance\` + ? WHERE \`id\` = ?`,
    [amount, userId],
  );
}

async function decrementUserBalance(
  conn: PoolConnection,
  userId: number,
  amount: number,
): Promise<void> {
  if (!Number.isFinite(amount) || amount === 0) return;
  await conn.execute<ResultSetHeader>(
    `UPDATE \`${USERS_TABLE}\` SET \`balance\` = \`balance\` - ? WHERE \`id\` = ?`,
    [amount, userId],
  );
}

/* -------------------------------------------------------------------------- */
/*  Public entrypoint: transaction.completed (NO subscription_id) → sold_items */
/* -------------------------------------------------------------------------- */

interface TransactionSaleResult {
  ok: boolean;
  reason?: string;
  buyerId?: number;
  /** Sold item ids in line-order — present on success even for duplicate inserts. */
  soldItemIds?: number[];
}

/**
 * 1:1 port of `GatewayPaddle::handleTransaction`.
 *
 * Loops over `items[]` paired with `details.line_items[]` (same index, same
 * order as Paddle delivers them). For every pair we build a `prepare` row
 * and feed it through `addSoldItemFromTransactionLine`.
 *
 * The unified-lifetime branch (`SubscriptionSystem::create` for lifetime
 * author subscriptions without a Paddle `sub_…` id) is handled upstream in
 * `upsertFromTransaction` — see `THIRD_PARTY_LIFETIME_PRICE_TO_AUTHOR` and
 * `pickAuthorIdForSubscriptionTransaction`.
 */
export async function handleTransactionForSale(
  txn: LaravelPaddleTransaction,
): Promise<TransactionSaleResult> {
  const txnId = String(txn.id ?? "");
  if (!txnId) return { ok: false, reason: "missing_transaction_id" };

  const items = txn.items ?? [];
  const lines = txn.details?.line_items ?? [];
  const lineCount = Math.min(items.length, lines.length);
  if (lineCount === 0) {
    return { ok: false, reason: "no_line_items" };
  }

  const buyerId = pickBuyerId(txn.custom_data);
  if (!buyerId) {
    return { ok: false, reason: "missing_buyer_id" };
  }

  const payment = pickPaymentMethod(txn.payments);
  const refAuthorId = pickNumber(txn.custom_data?.["ref_author_id"]);
  const refLinkId = pickNumber(txn.custom_data?.["ref_link_id"]);

  const pool = getPool();
  const conn = await pool.getConnection();

  const soldItemIds: number[] = [];
  try {
    await conn.beginTransaction();

    for (let i = 0; i < lineCount; i++) {
      const item = items[i];
      const line = lines[i];

      const productCustomData = (line?.product?.custom_data ?? null) as
        | Record<string, unknown>
        | null;
      const itemCustomData = (item?.price?.custom_data ?? null) as
        | Record<string, unknown>
        | null;

      const itemId = pickItemId(txn.custom_data, productCustomData);
      if (!itemId) {
        // Laravel just `continue`s in this case — keep that behaviour but log.
        console.warn(
          `[paddle-laravel-port] handleTransaction: skipping line ${i} of ${txnId} — no item_id in custom_data`,
        );
        continue;
      }

      const license = pickLicense(txn.custom_data, itemCustomData);
      const quantity = Math.max(1, Number(line?.quantity ?? item?.quantity ?? 1));

      // Money math — directly from `handleTransaction`:
      //
      //   unitTotalsSubtotal = line.unit_totals.subtotal   (= price * license per unit, in cents)
      //   unitTotalsFull     = line.unit_totals.total      (with tax, in cents)
      //   discount           = line.totals.discount        (per line, in cents)
      //   fUnitPrice         = unitTotalsSubtotal / 100
      //   fDiscount          = discount / 100
      //   fSystemTax         = unitTotalsFull * 5/100 + 0.5    (Paddle's gateway fee)
      //   fNetIncome         = (fUnitPrice - fDiscount) - fSystemTax
      const unitSubtotalCents = Number(line?.unit_totals?.subtotal ?? 0);
      const unitTotalCents = Number(line?.unit_totals?.total ?? 0);
      const discountCents = Number(line?.totals?.discount ?? 0);

      const fUnitPrice = minorToMajor(unitSubtotalCents);
      const fDiscount = discountCents ? minorToMajor(discountCents) : 0;
      const unitTotalsFullFloat = minorToMajor(unitTotalCents);
      const fSystemTax = round(
        unitTotalsFullFloat * (PADDLE_TXN_TAX_PERCENT / 100) + PADDLE_TXN_TAX_FLAT,
        2,
      );
      const fNetIncome = round(fUnitPrice - fDiscount - fSystemTax, 2);

      // Laravel's payment_id = $txnId . '-' . $line.id when line.id is set.
      const lineId = line?.id ? String(line.id) : "";
      const paymentId = lineId ? `${txnId}-${lineId}` : txnId;

      // Laravel's succeedSale builds `$itemsArr = [$itemId => ['qty' => $quantity, 'license' => $license]]`
      // and passes `$unitPriceAsMain = true`, which sets:
      //   sold_summary = $unitPrice
      //   sold_price   = $key->cart_one_price = $unitPrice    (no coupon path)
      const result = await addSoldItemFromTransactionLine({
        buyerId,
        itemId,
        paymentId,
        paymentMethod: payment.type,
        paymentLast4: payment.last4,
        license,
        qty: quantity,
        unitPrice: fUnitPrice,
        soldSummary: fUnitPrice,
        netIncome: fNetIncome,
        systemTax: fSystemTax,
        arguments_: {},
        refAuthorId,
        refLinkId,
        conn,
      });

      if (!result.ok) {
        throw new Error(
          `addSoldItem failed for line ${i} of ${txnId}: ${result.reason ?? "unknown"}`,
        );
      }
      if (result.soldItemId != null) soldItemIds.push(result.soldItemId);
    }

    await conn.commit();
    return { ok: true, buyerId, soldItemIds };
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

/* -------------------------------------------------------------------------- */
/*  adjustment.updated → sold_items refund                                     */
/* -------------------------------------------------------------------------- */

/**
 * Port of `SoldItems::handleCancellationPaymentPaddle($payment_id, $sub_tx_id)`.
 *
 * Paddle's adjustment.updated payload looks like:
 *   { transaction_id: "txn_…", items: [{ item_id: "txnitm_…", ... }, ...] }
 *
 * For each adjustment item we locate the matching `sold_items` row by the
 * composite `payment_id = "{transaction_id}-{item_id}"`, refund the author
 * balance(s), and flip `status` to 0. Idempotent: rows already at status≠1
 * are left untouched.
 */
export async function handleAdjustmentRefund(params: {
  transactionId: string;
  adjustmentItemId: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const compositePaymentId = `${params.transactionId}-${params.adjustmentItemId}`;
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    interface SoldRow extends RowDataPacket {
      id: number;
      author_id: number | null;
      co_author_id: number | null;
      ref_author_id: number | null;
      status: number;
      author_earn: number | string | null;
      co_earn: number | string | null;
      ref_earn: number | string | null;
      co_ref_earn: number | string | null;
      sold_summary: number | string | null;
      system_tax: number | string | null;
    }
    const [rows] = await conn.execute<SoldRow[]>(
      `SELECT id, author_id, co_author_id, ref_author_id, status,
              author_earn, co_earn, ref_earn, co_ref_earn,
              sold_summary, system_tax
         FROM \`${SOLD_ITEMS_TABLE}\`
        WHERE payment_id = ?
        LIMIT 1`,
      [compositePaymentId],
    );
    const row = rows[0];
    if (!row) {
      await conn.commit();
      return { ok: true, reason: "ignored_unknown_sold_item" };
    }
    if (row.status !== 1) {
      await conn.commit();
      return { ok: true, reason: "already_refunded" };
    }

    const mainAuthorAmountBase = Number(row.author_earn ?? 0);
    const coAuthorAmountBase = Number(row.co_earn ?? 0);
    const refEarn = Number(row.ref_earn ?? 0);
    const refCoEarn = Number(row.co_ref_earn ?? 0);
    const systemTax = Number(row.system_tax ?? 0);

    let mainAuthorAmount = mainAuthorAmountBase;
    let coAuthorAmount = coAuthorAmountBase;
    let clearedRefEarn = false;
    let clearedRefCoEarn = false;

    if (row.ref_author_id && row.author_id) {
      if (row.ref_author_id === row.author_id) {
        // Ref bound to the main author — already included in author_earn? No:
        // Laravel ADDS it on refund, so it must be tracked separately.
        mainAuthorAmount += refEarn;
        coAuthorAmount += refCoEarn;
      } else if (row.co_author_id != null && row.ref_author_id === row.co_author_id) {
        mainAuthorAmount += refCoEarn;
        coAuthorAmount += refEarn;
      } else {
        // External referral user — refund out of band.
        if (row.ref_author_id > 0) {
          await decrementUserBalance(conn, row.ref_author_id, refEarn);
        }
      }
      clearedRefEarn = true;
      if (row.co_author_id) clearedRefCoEarn = true;
    }

    if (row.author_id) {
      await decrementUserBalance(conn, row.author_id, mainAuthorAmount);
    }
    if (row.co_author_id) {
      await decrementUserBalance(conn, row.co_author_id, coAuthorAmount);
    }

    await conn.execute<ResultSetHeader>(
      `UPDATE \`${SOLD_ITEMS_TABLE}\`
          SET \`status\`         = 0,
              \`author_earn\`    = 0,
              \`co_earn\`        = CASE WHEN \`co_author_id\` IS NOT NULL THEN 0 ELSE \`co_earn\` END,
              \`ref_earn\`       = ${clearedRefEarn ? "0" : "`ref_earn`"},
              \`co_ref_earn\`    = ${clearedRefCoEarn ? "0" : "`co_ref_earn`"},
              \`platform_earn\`  = -?,
              \`updated_at\`     = NOW()
        WHERE \`id\` = ?`,
      [systemTax, row.id],
    );

    await conn.commit();
    return { ok: true };
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

/* -------------------------------------------------------------------------- */
/*  Third-party author subscriptions (Premiere Gal, Spunkram)                  */
/* -------------------------------------------------------------------------- */

/** Author bundles stored in `subscription_systems`, not Motionflow Creator tiers. */
const THIRD_PARTY_SUBSCRIPTION_AUTHOR_IDS = new Set<number>([4141, 1691]);

/**
 * One-time lifetime Paddle price ids → `subscription_systems.author_id`.
 * Premiere Gal Toolkit MAX lifetime (`pri_01km5ht3bbx00pa6yssfhf6td3`) has no
 * recurring Paddle subscription — checkout completes as `transaction.completed`
 * with `subscription_id = null`, but the row still belongs in `subscription_systems`.
 */
export const THIRD_PARTY_LIFETIME_PRICE_TO_AUTHOR: Record<string, number> = {
  pri_01km5ht3bbx00pa6yssfhf6td3: 4141,
};

/**
 * True when a one-time transaction is a marketplace item sale (`sold_items`),
 * not an author lifetime subscription. Used to avoid routing `item_licenses`
 * purchases into `subscription_systems`.
 */
export function isMarketplaceOneTimeSale(txn: LaravelPaddleTransaction): boolean {
  const cd = txn.custom_data ?? null;
  if (!cd) return false;

  const kind = String(cd["kind"] ?? "").trim().toLowerCase();
  if (kind === "spunkram_item") return true;

  const itemLicenses = cd["item_licenses"];
  if (itemLicenses && typeof itemLicenses === "object" && !Array.isArray(itemLicenses)) {
    return Object.keys(itemLicenses as object).length > 0;
  }

  return pickNumber(cd["item_id"]) != null || pickNumber(cd["itemId"]) != null;
}

/**
 * Compute the Paddle-derived monetary fields the way `handleSubscription`
 * does. Returned values are in major units. Used by the subscription branch
 * of `upsertFromTransaction` to fill in `author_earn`, `system_tax` and net
 * `amount` consistently with the Laravel writer.
 *
 * Formula (per line):
 *   unitPrice  = items[i].price.unit_price.amount / 100
 *   systemTax  = unitPrice * 5/100 + 0.5
 *   netIncome  = unitPrice - systemTax
 *   authorEarn = (netIncome * 0.9) / 2     (only meaningful for author subscriptions)
 */
export function computeSubscriptionMoneyFromTransaction(
  item: LaravelPaddleItem | undefined,
): { unitPrice: number; systemTax: number; netIncome: number; authorEarn: number } {
  const unitPrice = minorToMajor(item?.price?.unit_price?.amount ?? null);
  const systemTax = round(unitPrice * (PADDLE_TXN_TAX_PERCENT / 100) + PADDLE_TXN_TAX_FLAT, 2);
  const netIncome = round(unitPrice - systemTax, 2);
  const authorEarn = calculateAuthorEarnForSubscription(netIncome);
  return { unitPrice, systemTax, netIncome, authorEarn };
}

/**
 * Pick the third-party `author_id` for a Paddle subscription transaction.
 *
 * Laravel reads it from `details.line_items[i].product.custom_data.author_id`
 * AND requires `subs_system === 1` to confirm the product is an author
 * subscription (not Motionflow's own Creator/Creator-AI tier). We accept the
 * same path, plus our `Pricing.tsx` puts `author_id` directly on
 * `transaction.custom_data` for the Spunkram subscription, so we also accept
 * it from there as a fallback. Returns null when the txn is the platform's
 * own subscription (no author attribution).
 */
export function pickAuthorIdForSubscriptionTransaction(
  txn: LaravelPaddleTransaction,
): number | null {
  for (const item of txn.items ?? []) {
    const priceId = item?.price?.id?.trim();
    if (priceId) {
      const mappedAuthorId = THIRD_PARTY_LIFETIME_PRICE_TO_AUTHOR[priceId];
      if (mappedAuthorId) return mappedAuthorId;
    }
  }

  const lines = txn.details?.line_items ?? [];
  for (const line of lines) {
    const productCustom = (line?.product?.custom_data ?? null) as Record<string, unknown> | null;
    const subsSystem = pickNumber(productCustom?.["subs_system"]);
    const authorId = pickNumber(productCustom?.["author_id"]);
    if (authorId && subsSystem === 1) {
      return authorId;
    }
    // Lifetime author products often omit `subs_system = 1` on one-time prices.
    if (authorId && THIRD_PARTY_SUBSCRIPTION_AUTHOR_IDS.has(authorId)) {
      return authorId;
    }
  }
  // Fallback: our Pricing.tsx (Spunkram-subscription) puts author_id on
  // `transaction.custom_data` directly. Only honour it if `kind` says this
  // is a third-party subscription so we don't accidentally tag Motionflow's
  // core Creator tiers.
  const cd = txn.custom_data ?? null;
  const kind = String(cd?.["kind"] ?? "").trim().toLowerCase();
  if (kind === "spunkram_subscription") {
    return pickNumber(cd?.["author_id"]);
  }
  const txnAuthorId = pickNumber(cd?.["author_id"]);
  if (txnAuthorId && THIRD_PARTY_SUBSCRIPTION_AUTHOR_IDS.has(txnAuthorId)) {
    return txnAuthorId;
  }
  return null;
}
