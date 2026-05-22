/**
 * Move a one-time Spunkram item purchase that was wrongly written into
 * `subscription_systems` (because the Next.js Paddle webhook has no
 * `kind === "spunkram_item"` branch yet) over to the right table `sold_items`.
 *
 * Workflow:
 *   1. Read the row from `subscription_systems` by Paddle transaction id
 *      (`payment_id = txn_…`). The script also accepts a `--by-subscription-id`
 *      switch to look it up by `subscription_id` instead (lifetime/one-time
 *      rows have `subscription_id = txn_…`, so both columns usually match for
 *      one-off purchases, but the lookup mode is selectable just in case).
 *   2. Call Paddle `GET /transactions/{id}` to retrieve `custom_data.item_id`
 *      and `custom_data.license`. That data was never persisted on our side —
 *      Paddle is the source of truth here.
 *   3. Look up `marketplace_items.author_id` for the item (plus `co_author_id`
 *      parsed from the `team` JSON column when present).
 *   4. Generate an Envato-style `purchase_code` (8-4-4-4-12 uppercase hex).
 *   5. Run INSERT INTO `sold_items` + DELETE FROM `subscription_systems`
 *      inside a single transaction.
 *
 * Earnings split:
 *   We don't have the canonical Laravel split formula in the Next-app yet, so
 *   the script accepts CLI overrides:
 *     --author-share=<0..1>   fraction of `sold_price` going to the author
 *                              (default 0.7 — the typical marketplace share)
 *     --co-share=<0..1>       fraction going to the co-author (if any)
 *                              (default 0.0)
 *     --ref-earn=<amount>     absolute referral earning (default 0)
 *     --co-ref-earn=<amount>  absolute co-referral earning (default 0)
 *
 * Safety:
 *   Defaults to DRY RUN. Pass `--commit` to actually write/delete. Use
 *   `--force` to bypass the safety check that bails when an active sold_items
 *   row already exists for the same `(buyer_id, item_id)`.
 *
 * License mapping (matches the answer chosen earlier):
 *   personal   → 1
 *   commercial → 2
 *
 * Usage:
 *   node --env-file=.env scripts/migrate-spunkram-item-to-sold-items.mjs \
 *     txn_01... [--author-share=0.7] [--co-share=0] [--ref-earn=0] \
 *     [--co-ref-earn=0] [--by-subscription-id] [--force] [--commit]
 */
import crypto from "node:crypto";
import mysql from "mysql2/promise";

const SANDBOX_BASE = "https://sandbox-api.paddle.com";
const PRODUCTION_BASE = "https://api.paddle.com";
const SUBSCRIPTIONS_TABLE = "subscription_systems";
const SOLD_ITEMS_TABLE = "sold_items";
const MARKETPLACE_ITEMS_TABLE = process.env.DB_MARKET_ITEMS_TABLE ?? "marketplace_items";

const LICENSE_VALUES = { personal: 1, commercial: 2 };

function stripQuotes(value) {
  if (value == null) return undefined;
  const t = String(value).trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

function getPaddleBaseUrl() {
  const env = String(process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT ?? "sandbox").toLowerCase();
  return env === "production" ? PRODUCTION_BASE : SANDBOX_BASE;
}

function parseFlags(argv) {
  const out = {
    txnId: null,
    bySubscriptionId: false,
    authorShare: 0.7,
    coShare: 0.0,
    refEarn: 0,
    coRefEarn: 0,
    force: false,
    commit: false,
  };
  for (const raw of argv) {
    if (raw.startsWith("txn_") || raw.startsWith("sub_")) {
      out.txnId = raw;
      continue;
    }
    if (raw === "--by-subscription-id") { out.bySubscriptionId = true; continue; }
    if (raw === "--force") { out.force = true; continue; }
    if (raw === "--commit") { out.commit = true; continue; }
    const m = raw.match(/^--([a-z-]+)=(.+)$/);
    if (!m) continue;
    const [, key, val] = m;
    if (key === "author-share") out.authorShare = Number(val);
    else if (key === "co-share") out.coShare = Number(val);
    else if (key === "ref-earn") out.refEarn = Number(val);
    else if (key === "co-ref-earn") out.coRefEarn = Number(val);
  }
  if (!Number.isFinite(out.authorShare) || out.authorShare < 0 || out.authorShare > 1) {
    throw new Error("--author-share must be between 0 and 1");
  }
  if (!Number.isFinite(out.coShare) || out.coShare < 0 || out.coShare > 1) {
    throw new Error("--co-share must be between 0 and 1");
  }
  if (out.authorShare + out.coShare > 1) {
    throw new Error("--author-share + --co-share must not exceed 1");
  }
  return out;
}

async function fetchPaddleTransaction(id) {
  const apiKey = process.env.PADDLE_API_KEY;
  if (!apiKey) throw new Error("PADDLE_API_KEY not configured");
  const url = `${getPaddleBaseUrl()}/transactions/${encodeURIComponent(id)}?include=custom_data`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Paddle GET /transactions/${id} failed (${res.status}): ${text}`);
  }
  return JSON.parse(text).data;
}

/**
 * Generate an Envato-style purchase code: 8-4-4-4-12 uppercase hex.
 * Same shape as Paddle's checkout codes / marketplace `purchase_code` values.
 */
function generatePurchaseCode() {
  return crypto.randomUUID().toUpperCase();
}

function parseCoAuthorIdFromTeam(team) {
  if (team == null) return null;
  const raw = typeof team === "string" ? team : String(team);
  if (!raw || raw === "null") return null;
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object" && obj.co_author_id != null) {
      const n = Number(obj.co_author_id);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
  } catch {
    // `team` might be a Laravel/PHP-serialised value, or some non-JSON shape.
    // Fallback: regex pluck — same pattern used by `getContributorItemsPage`.
    const m = raw.match(/"co_author_id"\s*:\s*(\d+)/);
    if (m) {
      const n = Number(m[1]);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
  }
  return null;
}

function mapLicenseToInt(raw) {
  const norm = String(raw ?? "").trim().toLowerCase();
  if (norm === "personal") return LICENSE_VALUES.personal;
  if (norm === "commercial") return LICENSE_VALUES.commercial;
  const n = Number(raw);
  if (Number.isFinite(n)) return Math.trunc(n);
  return null;
}

function pickItemIdFromCustomData(cd) {
  const v = cd?.item_id ?? cd?.itemId ?? null;
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function pickBuyerIdFromCustomData(cd) {
  const v = cd?.buyer_id ?? cd?.userId ?? null;
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  if (!flags.txnId) {
    console.error(
      "Usage:\n" +
        "  node --env-file=.env scripts/migrate-spunkram-item-to-sold-items.mjs txn_01... [flags]\n" +
        "\nFlags:\n" +
        "  --by-subscription-id       look up subscription_systems by `subscription_id` instead of `payment_id`\n" +
        "  --author-share=<0..1>      fraction of sold_price → author_earn  (default 0.7)\n" +
        "  --co-share=<0..1>          fraction of sold_price → co_earn      (default 0.0)\n" +
        "  --ref-earn=<n>             absolute ref_earn value               (default 0)\n" +
        "  --co-ref-earn=<n>          absolute co_ref_earn value            (default 0)\n" +
        "  --force                    insert even if an active sold_items row already exists for (buyer_id, item_id)\n" +
        "  --commit                   actually run the writes (default: dry-run, prints planned changes)\n",
    );
    process.exit(1);
  }

  const host = process.env.DB_HOST;
  const user = process.env.DB_USERNAME;
  const password = stripQuotes(process.env.DB_PASSWORD);
  const database = process.env.DB_DATABASE;
  const port = Number(process.env.DB_PORT ?? 3306);
  if (!host || !user || password === undefined || !database) {
    console.error("Missing DB_HOST / DB_USERNAME / DB_PASSWORD / DB_DATABASE in env");
    process.exit(1);
  }

  console.log(
    `[migrate] mode=${flags.commit ? "COMMIT" : "DRY-RUN"} ` +
      `txn=${flags.txnId} lookup=${flags.bySubscriptionId ? "subscription_id" : "payment_id"}`,
  );

  const conn = await mysql.createConnection({ host, port, user, password, database });

  try {
    // 1. Load the offending subscription_systems row.
    const lookupColumn = flags.bySubscriptionId ? "subscription_id" : "payment_id";
    const [subRows] = await conn.execute(
      `SELECT id, buyer_id, subscription_id, payment_id, amount, amount_summary, system_tax,
              \`system\`, plan, type, paddle_product_id, paddle_price_id, paddle_product_name,
              count, status, created_at, updated_at
         FROM \`${SUBSCRIPTIONS_TABLE}\`
        WHERE \`${lookupColumn}\` = ?
        LIMIT 1`,
      [flags.txnId],
    );
    const sub = subRows[0];
    if (!sub) {
      console.error(`[migrate] No subscription_systems row found by ${lookupColumn} = ${flags.txnId}`);
      process.exit(2);
    }
    console.log(
      `[migrate] Found subscription_systems id=${sub.id} buyer=${sub.buyer_id} plan=${sub.plan} ` +
        `amount=${sub.amount} amount_summary=${sub.amount_summary} created_at=${sub.created_at}`,
    );

    // 2. Fetch the Paddle transaction so we know item_id / license / etc.
    const txnId = String(sub.payment_id ?? flags.txnId);
    const txn = await fetchPaddleTransaction(txnId);
    const customData = txn.custom_data ?? {};
    console.log(`[migrate] Paddle txn ${txnId} custom_data:`, customData);

    const kind = String(customData.kind ?? "").trim().toLowerCase();
    if (kind !== "spunkram_item") {
      console.error(
        `[migrate] custom_data.kind="${kind}" — this script only migrates Spunkram one-time items. Aborting.`,
      );
      process.exit(3);
    }

    const itemId = pickItemIdFromCustomData(customData);
    if (!itemId) {
      console.error("[migrate] custom_data.item_id missing/invalid in Paddle transaction. Aborting.");
      process.exit(4);
    }

    const license = mapLicenseToInt(customData.license);
    if (license == null) {
      console.error(
        `[migrate] custom_data.license="${customData.license}" is unrecognised. Expected "personal" or "commercial". Aborting.`,
      );
      process.exit(5);
    }

    const customDataBuyerId = pickBuyerIdFromCustomData(customData);
    const buyerId = Number(sub.buyer_id);
    if (customDataBuyerId && customDataBuyerId !== buyerId) {
      console.error(
        `[migrate] buyer mismatch: subscription_systems.buyer_id=${buyerId} vs custom_data.buyer_id=${customDataBuyerId}. Aborting.`,
      );
      process.exit(6);
    }

    // 3. Look up author_id (and optional co_author_id encoded in the `team` JSON).
    const [miRows] = await conn.execute(
      `SELECT id, author_id, team FROM \`${MARKETPLACE_ITEMS_TABLE}\` WHERE id = ? LIMIT 1`,
      [itemId],
    );
    const item = miRows[0];
    if (!item) {
      console.error(`[migrate] marketplace_items row id=${itemId} not found. Aborting.`);
      process.exit(7);
    }
    const authorId = Number(item.author_id);
    if (!Number.isFinite(authorId) || authorId <= 0) {
      console.error(`[migrate] marketplace_items.author_id invalid for item ${itemId}. Aborting.`);
      process.exit(8);
    }
    const coAuthorId = parseCoAuthorIdFromTeam(item.team);

    // 4. Idempotency guard — bail if an active sold_items row already exists
    //    for this (buyer_id, item_id) unless --force is passed.
    if (!flags.force) {
      const [dupRows] = await conn.execute(
        `SELECT id, purchase_code, sold_price, sold_summary, created_at
           FROM \`${SOLD_ITEMS_TABLE}\`
          WHERE buyer_id = ? AND item_id = ? AND status = 1
          ORDER BY id DESC LIMIT 1`,
        [buyerId, itemId],
      );
      if (dupRows[0]) {
        console.error(
          `[migrate] An active sold_items row already exists for buyer=${buyerId} item=${itemId} ` +
            `(id=${dupRows[0].id}, purchase_code=${dupRows[0].purchase_code}, created_at=${dupRows[0].created_at}). ` +
            `Pass --force to insert anyway, or run --commit only after manually checking.`,
        );
        process.exit(9);
      }
    }

    // 5. Compute earnings + assemble the row.
    const soldPrice = Number(sub.amount) || 0;
    const soldSummary = Number(sub.amount_summary) || 0;
    const authorEarnRaw = soldPrice * flags.authorShare;
    const coEarnRaw = coAuthorId ? soldPrice * flags.coShare : 0;
    const authorEarn = Math.round(authorEarnRaw * 100) / 100;
    const coEarn = Math.round(coEarnRaw * 100) / 100;
    const refEarn = Math.round(flags.refEarn * 100) / 100;
    const coRefEarn = Math.round(flags.coRefEarn * 100) / 100;
    const purchaseCode = generatePurchaseCode();

    const insertParams = [
      buyerId,
      itemId,
      license,
      purchaseCode,
      soldPrice,
      soldSummary,
      "paddle",
      1, // status = active
      authorId,
      coAuthorId,
      authorEarn,
      coEarn,
      refEarn,
      coRefEarn,
      sub.created_at, // keep the original purchase timestamp
      sub.created_at,
    ];

    const insertSql = `INSERT INTO \`${SOLD_ITEMS_TABLE}\`
        (buyer_id, item_id, license, purchase_code, sold_price, sold_summary,
         \`system\`, status, author_id, co_author_id, author_earn, co_earn,
         ref_earn, co_ref_earn, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    console.log("[migrate] Planned changes:");
    console.log(
      `  INSERT sold_items: buyer=${buyerId} item=${itemId} license=${license} ` +
        `purchase_code=${purchaseCode} sold_price=${soldPrice} sold_summary=${soldSummary} ` +
        `author=${authorId} co_author=${coAuthorId ?? "NULL"} author_earn=${authorEarn} ` +
        `co_earn=${coEarn} ref_earn=${refEarn} co_ref_earn=${coRefEarn} created_at=${sub.created_at}`,
    );
    console.log(
      `  DELETE subscription_systems id=${sub.id} subscription_id=${sub.subscription_id} payment_id=${sub.payment_id}`,
    );

    if (!flags.commit) {
      console.log("[migrate] DRY-RUN — re-run with --commit to apply the changes.");
      return;
    }

    // 6. Apply atomically.
    await conn.beginTransaction();
    try {
      const [insRes] = await conn.execute(insertSql, insertParams);
      const newSoldId = insRes.insertId;
      const [delRes] = await conn.execute(
        `DELETE FROM \`${SUBSCRIPTIONS_TABLE}\` WHERE id = ?`,
        [sub.id],
      );
      if (delRes.affectedRows !== 1) {
        throw new Error(
          `Expected to delete 1 subscription_systems row, deleted ${delRes.affectedRows}`,
        );
      }
      await conn.commit();
      console.log(
        `[migrate] OK. Inserted sold_items id=${newSoldId}, deleted subscription_systems id=${sub.id}.`,
      );
    } catch (err) {
      await conn.rollback();
      throw err;
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("[migrate] FAILED:", err);
  process.exit(1);
});
