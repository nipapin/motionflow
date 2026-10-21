import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { actualAccounting, actualAdjustment, accountingSource, isActualSubscription } from "@/lib/paddle-actual";
import { forwardActualAccountingPurchase, handlePaddleEvent, type PaddleWebhookEvent } from "@/lib/paddle-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Laravel forwards only after checking the original Paddle signature. This
 * second signature authenticates the bridge and binds account + environment.
 */
export async function POST(request: Request) {
  const secret = process.env.PADDLE_ACCOUNTING_BRIDGE_SECRET;
  if (!secret || secret.length < 32) return NextResponse.json({ error: "Bridge unavailable" }, { status: 503 });
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 2_000_000) return NextResponse.json({ error: "Too large" }, { status: 413 });
  const timestamp = request.headers.get("x-accounting-timestamp") ?? "";
  const supplied = request.headers.get("x-accounting-signature") ?? "";
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}:${raw}`).digest("hex");
  if (!/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
    || !/^[a-f0-9]{64}$/.test(supplied) || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = JSON.parse(raw) as { account: "default" | "spunkram"; environment: string; event: PaddleWebhookEvent };
    if (!["default", "spunkram"].includes(body.account)) throw new Error("Invalid account");
    const source = accountingSource(body.account);
    if (source.environment !== body.environment) throw new Error("Environment mismatch");
    const event = body.event;
    if (event.event_type === "transaction.completed") {
      const result = await actualAccounting.transaction(event.data, source);
      if (result.handled) await forwardActualAccountingPurchase(result);
      // Credits retain their existing idempotent fulfillment handler.
      if (result.handled && result.passthrough) await handlePaddleEvent(event, source);
      return NextResponse.json(result);
    }
    if (event.event_type === "adjustment.created" || event.event_type === "adjustment.updated") {
      return NextResponse.json(await actualAdjustment(event.data as Record<string, unknown>, source));
    }
    const subscriptionId = (event.data as { id?: string }).id;
    if (subscriptionId && event.event_type.startsWith("subscription.") && await isActualSubscription(subscriptionId)) {
      const result = await handlePaddleEvent(event, source);
      return NextResponse.json({ ...result, handled: true });
    }
    return NextResponse.json({ handled: false });
  } catch (error) {
    console.error("[paddle-accounting-bridge] Processing failed", error);
    return NextResponse.json({ error: "Accounting failed" }, { status: 500 });
  }
}
