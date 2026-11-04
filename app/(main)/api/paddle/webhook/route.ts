import { NextResponse } from "next/server";
import { accountingSource } from "@/lib/paddle-actual";
import { getSpunkramPaddleCredentials } from "@/lib/spunkram-paddle-credentials";
import {
  handlePaddleEvent,
  verifyPaddleSignature,
  type PaddleWebhookEvent,
} from "@/lib/paddle-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("paddle-signature");
  const defaultSecret = process.env.PADDLE_WEBHOOK_SECRET?.trim();
  let event: PaddleWebhookEvent | undefined;

  try {
    let account: "default" | "spunkram" = "default";
    if (!defaultSecret || !verifyPaddleSignature(rawBody, signature, defaultSecret)) {
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
    const result = await handlePaddleEvent(event, accountingSource(account));
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
