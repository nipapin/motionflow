import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getAccountingBridgeConfig } from "@/lib/paddle-accounting-config";
import { actualAccounting, accountingSource, isActualSubscription } from "@/lib/paddle-actual";
import { applyPaddleRefund, forwardActualAccountingPurchase, handlePaddleEvent, type PaddleWebhookEvent } from "@/lib/paddle-server";
import { SPUNKRAM_AUTHOR_ID } from "@/lib/spunkram-paddle-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Laravel forwards only after checking the original Paddle signature. This
 * second signature authenticates the bridge and binds account + environment.
 */
export async function POST(request: Request) {
  const { bridgeSecret: secret, environment } = await getAccountingBridgeConfig().catch((error) => {
    console.error("[paddle-accounting-bridge] Configuration unavailable", error);
    return { bridgeSecret: undefined, environment: undefined };
  });
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
    const source = await accountingSource(body.account, environment ?? "sandbox");
    if (source.environment !== body.environment) throw new Error("Environment mismatch");
    const event = body.event;
    if (event.event_type === "transaction.completed") {
      const result = await actualAccounting.transaction(event.data, source);
      if (result.handled) await forwardActualAccountingPurchase(result);
      if (result.handled && result.passthrough) {
        const fulfillment = await handlePaddleEvent(event, source);
        if (fulfillment.reason === "extra_generations_credit_failed") {
          return NextResponse.json({ error: fulfillment.reason }, { status: 503 });
        }
      }
      return NextResponse.json({ ...result, handled: result.handled || source.environment === "sandbox" });
    }
    if (event.event_type === "adjustment.created" || event.event_type === "adjustment.updated") {
      const result = await applyPaddleRefund(event.data as Record<string, unknown>, source);
      return NextResponse.json({ ...result, handled: result.handled || source.environment === "sandbox" });
    }
    const subscriptionId = (event.data as { id?: string }).id;
    if (subscriptionId && event.event_type.startsWith("subscription.") && await isActualSubscription(subscriptionId, SPUNKRAM_AUTHOR_ID)) {
      const result = await handlePaddleEvent(event, source);
      return NextResponse.json({ ...result, handled: true });
    }
    return NextResponse.json({ handled: false });
  } catch (error) {
    console.error("[paddle-accounting-bridge] Processing failed", error);
    return NextResponse.json({ error: "Accounting failed" }, { status: 500 });
  }
}
