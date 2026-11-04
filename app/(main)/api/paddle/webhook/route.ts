import { NextResponse } from "next/server";
import { accountingSource, isSpunkramSandboxBuyer, type AccountingSource } from "@/lib/paddle-actual";
import { getSpunkramPaddleCredentials } from "@/lib/spunkram-paddle-credentials";
import { getPool } from "@/lib/db";
import { getTransaction } from "@/lib/paddle-api";
import type { RowDataPacket } from "mysql2/promise";
import {
  handlePaddleEvent,
  verifyPaddleSignature,
  type PaddleWebhookEvent,
} from "@/lib/paddle-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sandboxSource = { account: "spunkram", environment: "sandbox" } as const;

async function ownsSandboxSubscription(subscriptionId: unknown) {
  if (typeof subscriptionId !== "string" || !subscriptionId.startsWith("sub_")) return false;
  const [[row]] = await getPool().execute<RowDataPacket[]>(
    "SELECT buyer_id FROM subscription_systems WHERE subscription_id=? AND subscription_systems.system='paddle_sandbox' LIMIT 1",
    [subscriptionId],
  );
  return isSpunkramSandboxBuyer(Number(row?.buyer_id));
}

async function isAllowedSandboxEvent(event: PaddleWebhookEvent) {
  const data = event.data as Record<string, unknown>;
  if (event.event_type.startsWith("subscription.")) return ownsSandboxSubscription(data.id);
  if (event.event_type !== "transaction.completed" && !event.event_type.startsWith("adjustment.")) return false;
  const txn = typeof data.transaction_id === "string" && event.event_type.startsWith("adjustment.")
    ? await getTransaction(data.transaction_id, sandboxSource) : data;
  const custom = txn.custom_data as { buyer_id?: unknown; userId?: unknown } | null | undefined;
  return isSpunkramSandboxBuyer(Number(custom?.buyer_id ?? custom?.userId)) ||
    ownsSandboxSubscription(txn.subscription_id);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("paddle-signature");
  const defaultSecret = process.env.PADDLE_WEBHOOK_SECRET?.trim();
  let event: PaddleWebhookEvent | undefined;

  try {
    let account: "default" | "spunkram" = "default";
    let source: AccountingSource | undefined;
    if (new URL(request.url).searchParams.get("source") === "spunkram-sandbox") {
      const { webhookSecret } = await getSpunkramPaddleCredentials("sandbox", false);
      if (!webhookSecret || !verifyPaddleSignature(rawBody, signature, webhookSecret)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
      source = sandboxSource;
    } else if (!defaultSecret || !verifyPaddleSignature(rawBody, signature, defaultSecret)) {
      const { webhookSecret } = await getSpunkramPaddleCredentials();
      if (!defaultSecret && !webhookSecret) {
        return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
      }
      if (!webhookSecret || !verifyPaddleSignature(rawBody, signature, webhookSecret)) {
        console.warn("[paddle-webhook] Invalid signature");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
      account = "spunkram";
    }

    try {
      event = JSON.parse(rawBody) as PaddleWebhookEvent;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (source === sandboxSource && !await isAllowedSandboxEvent(event)) {
      return NextResponse.json({ ok: true });
    }
    const result = await handlePaddleEvent(event, source ?? await accountingSource(account));
    if (result.reason === "subscription_period_pending" || result.reason === "extra_generations_credit_failed") {
      return NextResponse.json({ error: result.reason }, { status: 503 });
    }
    if (!result.handled) {
      console.info(
        `[paddle-webhook] Skipped ${event.event_type} (${event.event_id}): ${result.reason ?? "unhandled"}`,
      );
    } else {
      // Surface `result.reason` even on the success path — handlers can return
      // ok:true with a reason like `side_charge_skipped` or
      // `ignored_unknown_subscription`, which look identical to a real DB
      // upsert in the log otherwise.
      console.info(
        `[paddle-webhook] Handled ${event.event_type} (${event.event_id})${result.reason ? `: ${result.reason}` : ""}`,
      );
    }

    // Always 200 once the signature is verified — Paddle retries on non-2xx and we
    // don't want infinite retries for events we intentionally ignore.
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(
      event
        ? `[paddle-webhook] Error handling ${event.event_type} (${event.event_id}):`
        : "[paddle-webhook] Error preparing webhook request",
      err,
    );
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
