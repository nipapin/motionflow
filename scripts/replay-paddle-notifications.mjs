/**
 * Replay Paddle webhooks for a fixed batch of notification IDs (`ntf_…`).
 *
 * For each notification:
 *   1. `GET /notifications/{ntf_id}` — read `payload.event_id` and the full
 *      webhook body (`payload` is the same shape our `/api/paddle/webhook`
 *      handler expects).
 *   2. Sign the payload with `PADDLE_WEBHOOK_SECRET` and POST it to
 *      `PADDLE_REPLAY_WEBHOOK_URL`.
 *
 * Usage (from repo root on the server):
 *   node --env-file=.env scripts/replay-paddle-notifications.mjs
 *   node --env-file=.env scripts/replay-paddle-notifications.mjs --resolve-only
 *   node --env-file=.env scripts/replay-paddle-notifications.mjs --dump
 *
 * Flags:
 *   --dump           print resolved evt/txn summary, do not POST
 *   --resolve-only   print `ntf → evt → txn` mapping only, do not POST
 *   --delay=<ms>     pause between notifications (default 500)
 *
 * Required env:
 *   PADDLE_API_KEY
 *   PADDLE_WEBHOOK_SECRET
 *   PADDLE_REPLAY_WEBHOOK_URL   e.g. https://next.motionflow.pro/api/paddle/webhook
 *   NEXT_PUBLIC_PADDLE_ENVIRONMENT — "production" | "sandbox" (defaults sandbox)
 */
import crypto from "node:crypto";

const NOTIFICATION_IDS = [
  "ntf_01ks7dh3rxzw0n2hmv580dz774",
  "ntf_01ks676abw9zmpq7ax4yth6jky",
  "ntf_01ks60ej6jgv5h4wsv2nqdeakw",
  "ntf_01ks5zxfq9d2vmxbzyrnmmkjjs",
  "ntf_01ks8namfthdzgzb5kvwpsqymk",
  "ntf_01ks8cbqfy7z2w7258tkn88vef",
  "ntf_01ks8bmw74f1srkmgb8gkqhx8j",
  "ntf_01ks8b73twqjdjmrrp0c9mjawk",
  "ntf_01ks8b5k3ywcewehr25k5vys7k",
  "ntf_01ks84y6s1spqr2mz2fgc07hay",
  "ntf_01ks82mgka5b95tvbgspx6wj0a",
  "ntf_01ks8072t4bygjycxm7cw5vtbd",
  "ntf_01ks7rd33gytznv5x2e5r5sre4",
  "ntf_01ks7qhn386xwazpt3a8a4h50n",
];

const SANDBOX_BASE = "https://sandbox-api.paddle.com";
const PRODUCTION_BASE = "https://api.paddle.com";

function getPaddleBaseUrl() {
  const env = String(process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT ?? "sandbox").toLowerCase();
  return env === "production" ? PRODUCTION_BASE : SANDBOX_BASE;
}

function hasFlag(name) {
  return process.argv.slice(2).some((a) => a === name || a.startsWith(`${name}=`));
}

function flagValue(name, fallback) {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.slice(name.length + 1));
  return Number.isFinite(n) ? n : fallback;
}

function summarizePayload(payload) {
  const data = payload?.data ?? {};
  return {
    event_id: payload?.event_id ?? null,
    event_type: payload?.event_type ?? null,
    occurred_at: payload?.occurred_at ?? null,
    entity_id: data?.id ?? null,
    subscription_id: data?.subscription_id ?? null,
    customer_id: data?.customer_id ?? null,
    status: data?.status ?? null,
    custom_data: data?.custom_data ?? null,
  };
}

async function fetchNotification(ntfId) {
  const url = `${getPaddleBaseUrl()}/notifications/${encodeURIComponent(ntfId)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.PADDLE_API_KEY}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GET /notifications/${ntfId} failed (${res.status}): ${text}`);
  }
  const json = JSON.parse(text);
  const notification = json?.data;
  const payload = notification?.payload;
  if (!payload?.event_id || !payload?.event_type || !payload?.data) {
    throw new Error(
      `GET /notifications/${ntfId} returned an unexpected shape (missing payload.event_id/event_type/data)`,
    );
  }
  return {
    ntfId,
    notificationType: notification?.type ?? null,
    notificationStatus: notification?.status ?? null,
    payload,
    summary: summarizePayload(payload),
  };
}

function buildSignature(rawBody, webhookSecret) {
  const ts = Math.floor(Date.now() / 1000);
  const h1 = crypto
    .createHmac("sha256", webhookSecret)
    .update(`${ts}:${rawBody}`)
    .digest("hex");
  return `ts=${ts};h1=${h1}`;
}

async function replayToWebhook(evtPayload, webhookUrl, webhookSecret) {
  const body = JSON.stringify(evtPayload);
  const signature = buildSignature(body, webhookSecret);
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const apiKey = process.env.PADDLE_API_KEY;
  const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET;
  const webhookUrl = process.env.PADDLE_REPLAY_WEBHOOK_URL;
  const dumpOnly = hasFlag("--dump");
  const resolveOnly = hasFlag("--resolve-only");
  const delayMs = flagValue("--delay", 500);

  if (!apiKey || !webhookSecret || (!webhookUrl && !dumpOnly && !resolveOnly)) {
    console.error(
      "Missing required env.\n" +
        "  PADDLE_API_KEY\n" +
        "  PADDLE_WEBHOOK_SECRET\n" +
        "  PADDLE_REPLAY_WEBHOOK_URL   (not needed with --dump / --resolve-only)\n" +
        "\nExample:\n" +
        "  PADDLE_REPLAY_WEBHOOK_URL=https://next.motionflow.pro/api/paddle/webhook \\\n" +
        "  node --env-file=.env scripts/replay-paddle-notifications.mjs",
    );
    process.exit(1);
  }

  const ntfIds = NOTIFICATION_IDS;
  const mode = dumpOnly ? "DUMP" : resolveOnly ? "RESOLVE" : "REPLAY";
  console.log(
    `[replay] mode=${mode} count=${ntfIds.length} ` +
      `env=${process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT ?? "sandbox"}` +
      (mode === "REPLAY" ? ` target=${webhookUrl}` : ""),
  );

  let okCount = 0;
  let errCount = 0;
  let missingCount = 0;

  for (let i = 0; i < ntfIds.length; i++) {
    const ntfId = ntfIds[i];
    if (i > 0 && delayMs > 0) await sleep(delayMs);

    try {
      const resolved = await fetchNotification(ntfId);
      const { summary, payload } = resolved;

      if (resolveOnly) {
        console.log(
          `${ntfId}  ${summary.event_id}  ${summary.entity_id ?? "-"}  ${summary.event_type}`,
        );
        okCount += 1;
        continue;
      }

      if (dumpOnly) {
        console.log(
          JSON.stringify(
            {
              notification_id: ntfId,
              notification_type: resolved.notificationType,
              notification_status: resolved.notificationStatus,
              ...summary,
            },
            null,
            2,
          ),
        );
        okCount += 1;
        continue;
      }

      process.stdout.write(
        `  ${ntfId} → ${summary.event_id} (${summary.event_type}, ${summary.entity_id ?? "-"}) → `,
      );
      const result = await replayToWebhook(payload, webhookUrl, webhookSecret);
      const trimmed = result.body.replace(/\s+/g, " ").slice(0, 240);
      console.log(`HTTP ${result.status} ${trimmed}`);
      if (result.status >= 200 && result.status < 300) okCount += 1;
      else errCount += 1;
    } catch (err) {
      missingCount += 1;
      console.error(`  ${ntfId} FAILED: ${err?.message ?? err}`);
    }
  }

  console.log(
    `[replay] Done. ok=${okCount} failed=${errCount} fetch_failed=${missingCount}`,
  );
  process.exit(errCount > 0 || missingCount > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error("[replay] FAILED:", err);
  process.exit(1);
});
