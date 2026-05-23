/**
 * Replay Paddle webhook events that were skipped (e.g. with reason
 * `missing_userId_in_custom_data` / `missing_buyer_id`) by fetching their
 * payloads from Paddle's REST API, signing them with our webhook secret, and
 * POSTing them to our own `/api/paddle/webhook` endpoint. The webhook handler
 * then processes them normally (idempotency on `subscription_systems.subscription_id`
 * and on `paddle_extra_generation_credit_events.paddle_transaction_id` keeps
 * repeated runs safe).
 *
 * Usage (from repo root, after deploying the buyer-id fix):
 *   node --env-file=.env scripts/replay-paddle-events.mjs \
 *     evt_01ks7qhmpn6dj9szqrkdntncaw \
 *     evt_01ks84y6fb9wy2mbd7a9j1rtvd \
 *     ...
 *
 * Or pipe IDs (one per line / whitespace-separated):
 *   cat missed-events.txt | node --env-file=.env scripts/replay-paddle-events.mjs
 *
 * Required env:
 *   PADDLE_API_KEY                 — used to call `GET /events`
 *   PADDLE_WEBHOOK_SECRET          — used to sign the self-POST to our webhook
 *   PADDLE_REPLAY_WEBHOOK_URL      — full webhook URL, e.g.
 *                                    https://motionflow.app/api/paddle/webhook
 *   NEXT_PUBLIC_PADDLE_ENVIRONMENT — "production" | "sandbox" (defaults sandbox)
 *
 * Notes:
 *   - Paddle retains events for ~90 days. Older IDs return 404 from `GET /events`.
 *   - `GET /events` has no `?id=` filter, so the script paginates newest-first
 *     until all requested IDs are found or the cutoff is hit.
 *   - The webhook signature uses the current time, so we stay within the
 *     5-minute tolerance window enforced by `verifyPaddleSignature`.
 */
import crypto from "node:crypto";

const SANDBOX_BASE = "https://sandbox-api.paddle.com";
const PRODUCTION_BASE = "https://api.paddle.com";

function getPaddleBaseUrl() {
  const env = String(process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT ?? "sandbox").toLowerCase();
  return env === "production" ? PRODUCTION_BASE : SANDBOX_BASE;
}

const apiKey = process.env.PADDLE_API_KEY;
const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET;
const webhookUrl = process.env.PADDLE_REPLAY_WEBHOOK_URL;

if (!apiKey || !webhookSecret || !webhookUrl) {
  console.error(
    "Missing required env. Set PADDLE_API_KEY, PADDLE_WEBHOOK_SECRET, and PADDLE_REPLAY_WEBHOOK_URL.\n" +
      "Example:\n" +
      "  PADDLE_REPLAY_WEBHOOK_URL=https://motionflow.app/api/paddle/webhook \\\n" +
      "  node --env-file=.env scripts/replay-paddle-events.mjs evt_01ks...",
  );
  process.exit(1);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function collectTargetEventIds() {
  const args = process.argv.slice(2).filter((a) => a && !a.startsWith("--"));
  if (args.length) return args;
  if (!process.stdin.isTTY) {
    const txt = await readStdin();
    return txt
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s.startsWith("evt_"));
  }
  return [];
}

function hasFlag(name) {
  return process.argv.slice(2).includes(name);
}

function summarizeEvent(evt) {
  const d = evt.data ?? {};
  const items = Array.isArray(d.items) ? d.items : [];
  return {
    event_id: evt.event_id ?? evt.id,
    event_type: evt.event_type,
    occurred_at: evt.occurred_at,
    txn_id: d.id,
    subscription_id: d.subscription_id ?? null,
    customer_id: d.customer_id ?? null,
    status: d.status ?? null,
    origin: d.origin ?? null,
    custom_data: d.custom_data ?? null,
    items_summary: items.map((it) => ({
      product_id: it?.price?.product_id ?? null,
      price_id: it?.price?.id ?? null,
      price_name: it?.price?.name ?? null,
      billing_cycle: it?.price?.billing_cycle ?? null,
      quantity: it?.quantity ?? null,
    })),
    totals: d.details?.totals ?? null,
    billing_period: d.billing_period ?? null,
  };
}

async function paddleEventsPage(after) {
  const url = new URL("/events", getPaddleBaseUrl());
  url.searchParams.set("per_page", "200");
  url.searchParams.set("order_by", "id[DESC]");
  if (after) url.searchParams.set("after", after);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Paddle GET /events failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function fetchEventsByIds(targetIds, maxPages = 50) {
  const targets = new Set(targetIds);
  const found = new Map();
  let after = null;
  let pages = 0;
  while (targets.size > 0 && pages < maxPages) {
    const page = await paddleEventsPage(after);
    pages += 1;
    const items = Array.isArray(page?.data) ? page.data : [];
    for (const evt of items) {
      const id = evt.event_id ?? evt.id;
      if (id && targets.has(id)) {
        found.set(id, evt);
        targets.delete(id);
      }
    }
    if (targets.size === 0) break;
    if (!page?.meta?.pagination?.has_more) break;
    const nextUrl = page.meta.pagination.next;
    if (!nextUrl) break;
    let nextCursor = null;
    try {
      nextCursor = new URL(nextUrl).searchParams.get("after");
    } catch {
      nextCursor = null;
    }
    if (!nextCursor || nextCursor === after) break;
    after = nextCursor;
  }
  return { found, missing: [...targets], pagesScanned: pages };
}

function buildSignature(rawBody) {
  const ts = Math.floor(Date.now() / 1000);
  const h1 = crypto
    .createHmac("sha256", webhookSecret)
    .update(`${ts}:${rawBody}`)
    .digest("hex");
  return `ts=${ts};h1=${h1}`;
}

async function replayToWebhook(evtPayload) {
  // The webhook handler reads `event_id`, `event_type`, `occurred_at`, `data`
  // and ignores extra fields (e.g. `notification_id`). We forward the event
  // payload as-is so that the body is a faithful replay.
  const body = JSON.stringify(evtPayload);
  const signature = buildSignature(body);
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Paddle-Signature": signature,
    },
    body,
  });
  const text = await res.text();
  return { status: res.status, body: text };
}

(async () => {
  const dumpOnly = hasFlag("--dump");
  const ids = await collectTargetEventIds();
  if (ids.length === 0) {
    console.error(
      "Provide event IDs as args or via stdin (one per line or whitespace-separated).\n" +
        "Usage:\n" +
        "  node --env-file=.env scripts/replay-paddle-events.mjs evt_01... evt_02...\n" +
        "  node --env-file=.env scripts/replay-paddle-events.mjs --dump evt_01...     # print payloads, do not POST",
    );
    process.exit(1);
  }
  if (!dumpOnly) {
    console.log(
      `Replaying ${ids.length} event(s) via ${webhookUrl} (env=${process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT ?? "sandbox"})…`,
    );
  } else {
    console.log(
      `Fetching ${ids.length} event(s) for inspection (env=${process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT ?? "sandbox"})…`,
    );
  }

  const { found, missing, pagesScanned } = await fetchEventsByIds(ids);
  console.log(`Scanned ${pagesScanned} page(s); found ${found.size}/${ids.length}.`);
  if (missing.length) {
    console.warn(
      `Not found on Paddle (older than ~90 days, wrong env, or wrong API key?): ${missing.join(", ")}`,
    );
  }

  if (dumpOnly) {
    for (const [, evt] of found) {
      console.log(JSON.stringify(summarizeEvent(evt), null, 2));
    }
    process.exit(missing.length > 0 ? 2 : 0);
  }

  let okCount = 0;
  let errCount = 0;
  for (const [id, evt] of found) {
    process.stdout.write(`  ${id} (${evt.event_type}) → `);
    try {
      const result = await replayToWebhook(evt);
      const trimmed = result.body.replace(/\s+/g, " ").slice(0, 240);
      console.log(`HTTP ${result.status} ${trimmed}`);
      if (result.status >= 200 && result.status < 300) okCount += 1;
      else errCount += 1;
    } catch (err) {
      console.log(`FAILED: ${err?.message ?? err}`);
      errCount += 1;
    }
  }

  console.log(
    `Done. delivered=${okCount} failed=${errCount} not_found=${missing.length}`,
  );
  process.exit(errCount > 0 || missing.length > 0 ? 2 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
