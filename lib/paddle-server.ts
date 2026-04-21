import "server-only";
import crypto from "node:crypto";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { normalizePaddleProductNameToken } from "@/lib/paddle-product-label";

const SUBSCRIPTIONS_TABLE = "subscription_systems";
const PAYMENT_SYSTEM = "paddle";

/**
 * Paddle subscription statuses we map to our internal `status` integer.
 *  1 → active / trialing / past_due / paused
 * -1 → canceled (access ends at `ends_at`)
 */
type PaddleSubStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "paused"
  | "canceled";

interface PaddleUnitPrice {
  amount: string;
  currency_code: string;
}

interface PaddleBillingCycle {
  interval: "day" | "week" | "month" | "year" | string;
  frequency: number;
}

interface PaddleItem {
  status?: string;
  quantity?: number;
  recurring?: boolean;
  trial_dates?: { starts_at: string | null; ends_at: string | null } | null;
  /** Populated on many webhook payloads when items include the related product. */
  product?: {
    id?: string;
    name?: string | null;
  } | null;
  price?: {
    id?: string;
    /** Linked catalog product (`pro_…`). */
    product_id?: string;
    /** Shown at checkout; often the billing interval label if product name is absent. */
    name?: string | null;
    unit_price?: PaddleUnitPrice | null;
    billing_cycle?: PaddleBillingCycle | null;
  } | null;
}

interface PaddleSubscription {
  id: string;
  status: PaddleSubStatus;
  custom_data?: { userId?: string | number; plan?: string; billingPeriod?: string } | null;
  current_billing_period?: { starts_at?: string | null; ends_at?: string | null } | null;
  next_billed_at?: string | null;
  scheduled_change?: { action: string; effective_at: string } | null;
  items?: PaddleItem[];
  transaction_id?: string | null;
}

interface PaddleTxnTotals {
  total?: string;
  tax?: string;
  subtotal?: string;
  grand_total?: string;
  currency_code?: string;
}

interface PaddleTxnLineItem {
  id?: string;
  price_id?: string;
  quantity?: number;
}

interface PaddleTxnPayment {
  status?: string;
  method_details?: {
    type?: string;
    card?: {
      type?: string;
      last4?: string;
      cardholder_name?: string;
    } | null;
  } | null;
}

interface PaddleTransaction {
  id: string;
  status?: string;
  subscription_id?: string | null;
  customer_id?: string | null;
  invoice_id?: string | null;
  invoice_number?: string | null;
  currency_code?: string | null;
  custom_data?: { userId?: string | number; plan?: string; billingPeriod?: string } | null;
  items?: PaddleItem[];
  details?: {
    totals?: PaddleTxnTotals | null;
    line_items?: PaddleTxnLineItem[];
  } | null;
  payments?: PaddleTxnPayment[];
  billing_period?: { starts_at?: string | null; ends_at?: string | null } | null;
  created_at?: string | null;
  billed_at?: string | null;
}

interface PaddleWebhookEvent {
  event_id: string;
  event_type: string;
  occurred_at: string;
  data: PaddleSubscription | PaddleTransaction | Record<string, unknown>;
}

/* -------------------------------------------------------------------------- */
/*  Signature verification                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Paddle webhook signatures look like:
 *   Paddle-Signature: ts=1696500000;h1=hexsha256
 * Hash is HMAC-SHA256(secret, `${ts}:${rawBody}`).
 * Docs: https://developer.paddle.com/webhooks/signature-verification
 */
export function verifyPaddleSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  toleranceSeconds = 5 * 60,
): boolean {
  if (!signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(";").map((part) => {
      const [k, v] = part.split("=");
      return [k?.trim() ?? "", v?.trim() ?? ""];
    }),
  );

  const ts = parts["ts"];
  const h1 = parts["h1"];
  if (!ts || !h1) return false;

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  const ageSeconds = Math.abs(Date.now() / 1000 - tsNum);
  if (ageSeconds > toleranceSeconds) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${ts}:${rawBody}`)
    .digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(h1, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** DB enum is `('monthly','quarter','annual','lifetime')`. */
type DbPlan = "monthly" | "quarter" | "annual" | "lifetime";

function intervalToDbPlan(
  cycle: PaddleBillingCycle | null | undefined,
  fallback?: string | null,
): DbPlan {
  // No billing cycle = one-time purchase = lifetime
  if (!cycle) return "lifetime";

  const interval = cycle.interval;
  const frequency = Number(cycle.frequency) || 1;

  if (interval === "year") return "annual";
  if (interval === "month") {
    if (frequency >= 12) return "annual";
    if (frequency >= 3) return "quarter";
    return "monthly";
  }
  if (interval === "week" || interval === "day") return "monthly";

  // Fallback to custom_data hint
  if (fallback === "yearly") return "annual";
  if (fallback === "monthly") return "monthly";
  return "monthly";
}

function pickSubscriptionPlan(sub: PaddleSubscription): DbPlan {
  return intervalToDbPlan(
    sub.items?.[0]?.price?.billing_cycle ?? null,
    sub.custom_data?.billingPeriod ?? null,
  );
}

function pickTransactionPlan(txn: PaddleTransaction): DbPlan {
  return intervalToDbPlan(
    txn.items?.[0]?.price?.billing_cycle ?? null,
    txn.custom_data?.billingPeriod ?? null,
  );
}

function pickEndsAt(sub: PaddleSubscription): string | null {
  if (sub.scheduled_change?.action === "cancel" && sub.scheduled_change.effective_at) {
    return toMysqlDateTime(sub.scheduled_change.effective_at);
  }
  const raw = sub.current_billing_period?.ends_at ?? sub.next_billed_at ?? null;
  return raw ? toMysqlDateTime(raw) : null;
}

/** Mirrors Paddle `current_billing_period` for quota reset windows. */
function pickCurrentBillingPeriodFromSubscription(sub: PaddleSubscription): {
  startsAt: string | null;
  endsAt: string | null;
} {
  const p = sub.current_billing_period;
  if (!p) return { startsAt: null, endsAt: null };
  return {
    startsAt: p.starts_at ? toMysqlDateTime(p.starts_at) : null,
    endsAt: p.ends_at ? toMysqlDateTime(p.ends_at) : null,
  };
}

/** From `transaction.completed` payload when `billing_period` is present. */
function pickCurrentBillingPeriodFromTransaction(txn: PaddleTransaction): {
  startsAt: string | null;
  endsAt: string | null;
} {
  const p = txn.billing_period;
  if (!p) return { startsAt: null, endsAt: null };
  return {
    startsAt: p.starts_at ? toMysqlDateTime(p.starts_at) : null,
    endsAt: p.ends_at ? toMysqlDateTime(p.ends_at) : null,
  };
}

function pickTrialEndsAt(sub: PaddleSubscription): string | null {
  const raw = sub.items?.[0]?.trial_dates?.ends_at ?? null;
  return raw ? toMysqlDateTime(raw) : null;
}

/** First line item’s Paddle `price.id` / `price.product_id` (subscription or transaction payloads). */
function pickPaddleCatalogIds(
  items: PaddleItem[] | undefined,
): { priceId: string | null; productId: string | null } {
  const price = items?.[0]?.price;
  const priceId = price?.id?.trim() || null;
  const productId = price?.product_id?.trim() || null;
  return { priceId, productId };
}

/** Prefer `product.name`, else `price.name`; stored token is normalized (see `normalizePaddleProductNameToken`). */
function pickPaddleProductName(items: PaddleItem[] | undefined): string | null {
  const item = items?.[0];
  const raw = item?.product?.name?.trim() || item?.price?.name?.trim() || null;
  if (!raw) return null;
  const token = normalizePaddleProductNameToken(raw);
  return token || raw;
}

function toMysqlDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function pickUserId(
  data: { custom_data?: { userId?: string | number } | null },
): number | null {
  const raw = data.custom_data?.userId;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function statusToInt(status: PaddleSubStatus): number {
  return status === "canceled" ? -1 : 1;
}

/** Convert Paddle minor units string ("13700") to major units number (137). */
function minorToMajor(raw: string | null | undefined): number {
  if (raw == null) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n) / 100;
}

function buildArgumentsJson(payments: PaddleTxnPayment[] | undefined): string {
  const p = payments?.find((x) => x.status === "captured") ?? payments?.[0];
  const method = p?.method_details?.type ?? "";
  const last4 = p?.method_details?.card?.last4 ?? null;
  return JSON.stringify({ method, last_signs: last4 });
}

/* -------------------------------------------------------------------------- */
/*  Persistence                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Acquires a MySQL advisory lock for the given key. Returns true on success.
 * The lock is held on the connection and must be released on the same one.
 *
 * `GET_LOCK` keys are limited to 64 chars; we hash to stay safe.
 */
async function acquirePaddleLock(
  conn: PoolConnection,
  subscriptionId: string,
  timeoutSeconds = 10,
): Promise<{ acquired: boolean; key: string }> {
  const key = `paddle_sub_${crypto
    .createHash("sha1")
    .update(subscriptionId)
    .digest("hex")
    .slice(0, 32)}`;
  const [rows] = await conn.execute<RowDataPacket[]>(
    `SELECT GET_LOCK(?, ?) AS got`,
    [key, timeoutSeconds],
  );
  const got = (rows[0] as { got: number | null } | undefined)?.got;
  return { acquired: got === 1, key };
}

async function releasePaddleLock(conn: PoolConnection, key: string): Promise<void> {
  try {
    await conn.execute(`SELECT RELEASE_LOCK(?)`, [key]);
  } catch {
    /* ignore */
  }
}

/**
 * Full row upsert from a `transaction.completed` event. This is the source of
 * truth: it carries the captured payment, all monetary totals, the card method
 * details, and (for subscription transactions) the billing period.
 *
 * Strategy:
 *  1. Acquire a MySQL advisory lock keyed on the subscription/transaction id
 *     so concurrent webhook deliveries (Paddle fires several events within ~1s)
 *     cannot race.
 *  2. `INSERT ... ON DUPLICATE KEY UPDATE` on `subscription_id` so a second
 *     delivery cleanly updates the existing row.
 *
 * REQUIRED one-time DDL:
 *
 *   ALTER TABLE subscription_systems
 *     ADD UNIQUE KEY uniq_subscription_id (subscription_id);
 *
 *   See `db/migrations/2026_04_21_subscription_systems_paddle_ids.sql` for
 *   `paddle_product_id` / `paddle_price_id` columns,
 *   `2026_04_22_subscription_systems_paddle_product_name.sql` for display name, and
 *   `2026_04_23_subscription_systems_paddle_billing_period.sql` for quota windows.
 */
export async function upsertFromTransaction(txn: PaddleTransaction): Promise<{
  ok: boolean;
  reason?: string;
}> {
  const userId = pickUserId(txn);
  if (!userId) return { ok: false, reason: "missing_userId_in_custom_data" };

  // For recurring purchases the subscription_id is the stable key; for one-time
  // purchases there isn't one, so fall back to the transaction id (matches
  // legacy Laravel behaviour where lifetime rows have `subscription_id = txn_…`).
  const rowSubscriptionId = txn.subscription_id ?? txn.id;
  const paymentId = txn.id;

  const totals = txn.details?.totals ?? {};
  const subtotal = minorToMajor(totals.subtotal); // amount
  const grandTotal = minorToMajor(totals.grand_total ?? totals.total); // amount_summary
  const taxAmount = minorToMajor(totals.tax);
  const currencyCode = totals.currency_code ?? txn.currency_code ?? null;

  const plan = pickTransactionPlan(txn);
  const quantity = Number(txn.items?.[0]?.quantity) || 1;
  const { priceId: paddlePriceId, productId: paddleProductId } = pickPaddleCatalogIds(txn.items);
  const paddleProductName = pickPaddleProductName(txn.items);

  // ends_at: subscription transactions carry billing_period; one-time purchases
  // (lifetime) leave it NULL.
  const endsAt = txn.billing_period?.ends_at
    ? toMysqlDateTime(txn.billing_period.ends_at)
    : null;
  const trialEndsAt = txn.items?.[0]?.trial_dates?.ends_at
    ? toMysqlDateTime(txn.items[0].trial_dates!.ends_at!)
    : null;

  const billingPeriod = pickCurrentBillingPeriodFromTransaction(txn);

  const argumentsJson = buildArgumentsJson(txn.payments);

  const pool = getPool();
  const conn: PoolConnection = await pool.getConnection();
  let lockKey: string | null = null;
  try {
    const lock = await acquirePaddleLock(conn, rowSubscriptionId);
    if (!lock.acquired) return { ok: false, reason: "could_not_acquire_lock" };
    lockKey = lock.key;

    const insertParams = [
      userId,
      rowSubscriptionId,
      paymentId,
      1,
      subtotal,
      grandTotal,
      Math.round(grandTotal),
      taxAmount,
      PAYMENT_SYSTEM,
      "personal",
      plan,
      paddleProductId,
      paddlePriceId,
      paddleProductName,
      quantity,
      argumentsJson,
      trialEndsAt,
      endsAt,
      billingPeriod.startsAt,
      billingPeriod.endsAt,
    ];
    const valuePlaceholders = insertParams.map(() => "?").join(", ");

    await conn.execute<ResultSetHeader>(
      `INSERT INTO \`${SUBSCRIPTIONS_TABLE}\`
         (\`buyer_id\`, \`subscription_id\`, \`payment_id\`, \`status\`,
          \`amount\`, \`amount_summary\`, \`price\`, \`system_tax\`,
          \`system\`, \`type\`, \`plan\`, \`paddle_product_id\`, \`paddle_price_id\`,
          \`paddle_product_name\`,
          \`count\`, \`arguments\`,
          \`trial_ends_at\`, \`ends_at\`,
          \`paddle_billing_period_starts_at\`, \`paddle_billing_period_ends_at\`,
          \`created_at\`, \`updated_at\`)
       VALUES (${valuePlaceholders}, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         \`buyer_id\`       = VALUES(\`buyer_id\`),
         \`payment_id\`     = VALUES(\`payment_id\`),
         \`status\`         = VALUES(\`status\`),
         \`amount\`         = VALUES(\`amount\`),
         \`amount_summary\` = VALUES(\`amount_summary\`),
         \`price\`          = VALUES(\`price\`),
         \`system_tax\`     = VALUES(\`system_tax\`),
         \`system\`         = VALUES(\`system\`),
         \`plan\`           = VALUES(\`plan\`),
         \`paddle_product_id\` = COALESCE(VALUES(\`paddle_product_id\`), \`paddle_product_id\`),
         \`paddle_price_id\`   = COALESCE(VALUES(\`paddle_price_id\`), \`paddle_price_id\`),
         \`paddle_product_name\` = COALESCE(VALUES(\`paddle_product_name\`), \`paddle_product_name\`),
         \`count\`          = VALUES(\`count\`),
         \`arguments\`      = VALUES(\`arguments\`),
         \`trial_ends_at\`  = VALUES(\`trial_ends_at\`),
         \`ends_at\`        = COALESCE(VALUES(\`ends_at\`), \`ends_at\`),
         \`paddle_billing_period_starts_at\` = COALESCE(VALUES(\`paddle_billing_period_starts_at\`), \`paddle_billing_period_starts_at\`),
         \`paddle_billing_period_ends_at\` = COALESCE(VALUES(\`paddle_billing_period_ends_at\`), \`paddle_billing_period_ends_at\`),
         \`updated_at\`     = NOW()`,
      insertParams,
    );

    // currency stamp for analytics — kept in a separate column historically;
    // we don't have one in the schema, so we just log it.
    if (currencyCode && currencyCode !== "USD") {
      console.info(
        `[paddle] non-USD transaction ${paymentId} currency=${currencyCode}`,
      );
    }

    return { ok: true };
  } finally {
    if (lockKey) await releasePaddleLock(conn, lockKey);
    conn.release();
  }
}

/**
 * Light update applied on `subscription.activated|updated|resumed`. Refreshes
 * status/plan/ends_at/trial_ends_at on an existing row but does NOT create one
 * (creation happens in `transaction.completed`, which carries all the monetary
 * data we need to satisfy NOT NULL columns like `payment_id` / `arguments`).
 */
export async function refreshSubscription(sub: PaddleSubscription): Promise<{
  ok: boolean;
  reason?: string;
}> {
  if (!sub.id) return { ok: false, reason: "missing_subscription_id" };

  const status = statusToInt(sub.status);
  const plan = pickSubscriptionPlan(sub);
  const endsAt = pickEndsAt(sub);
  const trialEndsAt = pickTrialEndsAt(sub);
  const { priceId: paddlePriceId, productId: paddleProductId } = pickPaddleCatalogIds(sub.items);
  const paddleProductName = pickPaddleProductName(sub.items);
  const billingPeriod = pickCurrentBillingPeriodFromSubscription(sub);

  const pool = getPool();
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE \`${SUBSCRIPTIONS_TABLE}\`
        SET \`status\`        = ?,
            \`plan\`          = ?,
            \`trial_ends_at\` = ?,
            \`ends_at\`       = COALESCE(?, \`ends_at\`),
            \`paddle_product_id\` = COALESCE(?, \`paddle_product_id\`),
            \`paddle_price_id\`   = COALESCE(?, \`paddle_price_id\`),
            \`paddle_product_name\` = COALESCE(?, \`paddle_product_name\`),
            \`paddle_billing_period_starts_at\` = COALESCE(?, \`paddle_billing_period_starts_at\`),
            \`paddle_billing_period_ends_at\` = COALESCE(?, \`paddle_billing_period_ends_at\`),
            \`updated_at\`    = NOW()
      WHERE \`subscription_id\` = ?`,
    [
      status,
      plan,
      trialEndsAt,
      endsAt,
      paddleProductId,
      paddlePriceId,
      paddleProductName,
      billingPeriod.startsAt,
      billingPeriod.endsAt,
      sub.id,
    ],
  );

  if (result.affectedRows === 0) {
    return { ok: true, reason: "no_existing_row_yet" };
  }
  return { ok: true };
}

/**
 * Marks a subscription as canceled (status = -1) in the DB if we already track it.
 *
 * IMPORTANT: This intentionally does NOT insert a new row when no existing row
 * is found. Paddle fires `subscription.canceled` for subscriptions that were
 * created but never paid for (abandoned checkouts) — we don't care about those
 * because we never granted access for them.
 */
export async function markSubscriptionCanceled(
  sub: PaddleSubscription,
): Promise<{ ok: boolean; reason?: string }> {
  if (!sub.id) return { ok: false, reason: "missing_subscription_id" };

  const endsAt = pickEndsAt(sub);

  const pool = getPool();
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE \`${SUBSCRIPTIONS_TABLE}\`
        SET \`status\`     = -1,
            \`ends_at\`    = COALESCE(?, \`ends_at\`),
            \`updated_at\` = NOW()
      WHERE \`subscription_id\` = ?`,
    [endsAt, sub.id],
  );

  if (result.affectedRows === 0) {
    return { ok: true, reason: "ignored_unknown_subscription" };
  }
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  Event router                                                               */
/* -------------------------------------------------------------------------- */

const REFRESH_EVENTS = new Set([
  "subscription.activated",
  "subscription.updated",
  "subscription.resumed",
]);

export async function handlePaddleEvent(
  event: PaddleWebhookEvent,
): Promise<{ handled: boolean; reason?: string }> {
  // Skip `subscription.created` entirely — Paddle fires it the moment the
  // checkout is initialized, even before payment. We only want to record
  // the subscription once it's actually paid for, which arrives via
  // `transaction.completed`.
  if (event.event_type === "subscription.created") {
    return { handled: false, reason: "ignored_pre_activation_event" };
  }

  // Source of truth: full row upsert with all the monetary + payment data.
  if (event.event_type === "transaction.completed") {
    const txn = event.data as PaddleTransaction;
    if (!txn?.id) return { handled: false, reason: "missing_transaction_id" };
    if (txn.status && txn.status !== "completed") {
      return { handled: false, reason: `transaction_status_${txn.status}` };
    }
    const result = await upsertFromTransaction(txn);
    return { handled: result.ok, reason: result.reason };
  }

  // Light refresh of status/plan/ends_at on an existing row.
  if (REFRESH_EVENTS.has(event.event_type)) {
    const sub = event.data as PaddleSubscription;
    if (!sub?.id) return { handled: false, reason: "missing_subscription_id" };
    const result = await refreshSubscription(sub);
    return { handled: result.ok, reason: result.reason };
  }

  if (event.event_type === "subscription.canceled" || event.event_type === "subscription.paused") {
    const sub = event.data as PaddleSubscription;
    if (!sub?.id) return { handled: false, reason: "missing_subscription_id" };
    const result = await markSubscriptionCanceled(sub);
    return { handled: result.ok, reason: result.reason };
  }

  return { handled: false, reason: "unhandled_event_type" };
}

export type { PaddleWebhookEvent, PaddleSubscription, PaddleTransaction };
