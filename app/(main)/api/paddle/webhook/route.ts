import { NextResponse } from "next/server";
import {
  handlePaddleEvent,
  verifyPaddleSignature,
  type PaddleWebhookEvent,
} from "@/lib/paddle-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[paddle-webhook] PADDLE_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("paddle-signature");

  if (!verifyPaddleSignature(rawBody, signature, secret)) {
    console.warn("[paddle-webhook] Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: PaddleWebhookEvent;
  try {
    event = JSON.parse(rawBody) as PaddleWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const result = await handlePaddleEvent(event);
    if (!result.handled) {
      console.info(
        `[paddle-webhook] Skipped ${event.event_type} (${event.event_id}): ${result.reason ?? "unhandled"}`,
      );
    } else {
      console.info(`[paddle-webhook] Handled ${event.event_type} (${event.event_id})`);
    }

    // Always 200 once the signature is verified — Paddle retries on non-2xx and we
    // don't want infinite retries for events we intentionally ignore.
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(
      `[paddle-webhook] Error handling ${event.event_type} (${event.event_id}):`,
      err,
    );
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
