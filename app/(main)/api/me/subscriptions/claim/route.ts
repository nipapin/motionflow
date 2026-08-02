import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getTransaction, PaddleApiError, type PaddleApiAccount } from "@/lib/paddle-api";
import { upsertFromTransaction } from "@/lib/paddle-server";
import { isSpunkramSubscriptionPriceId } from "@/lib/spunkram-paddle-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Client-initiated fallback after `paddle.Checkout` `checkout.completed`.
 * Verifies the transaction via Paddle Billing API and upserts
 * `subscription_systems` when the `transaction.completed` webhook cannot
 * reach this environment (typical for local sandbox without a tunnel).
 *
 * Body: `{ transactionId: string }`
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  let transactionId: string | null = null;
  try {
    const body = (await request.json().catch(() => null)) as
      | { transactionId?: unknown; transaction_id?: unknown }
      | null;
    const raw = body?.transactionId ?? body?.transaction_id;
    if (typeof raw === "string" && raw.trim()) {
      transactionId = raw.trim();
    }
  } catch {
    // handled below
  }

  if (!transactionId) {
    return NextResponse.json({ error: "transactionId is required" }, { status: 400 });
  }

  try {
    // Prefer Spunkram sandbox when the client tells us via price/kind hints on
    // a first probe; if Spunkram key is missing we fall back to default.
    let account: PaddleApiAccount = "spunkram";
    let txn;
    try {
      txn = await getTransaction(transactionId, { account });
    } catch (err) {
      if (!(err instanceof PaddleApiError) || err.status !== 404) throw err;
      account = "default";
      txn = await getTransaction(transactionId, { account });
    }

    const status = String(txn.status ?? "").toLowerCase();
    if (status !== "completed" && status !== "paid" && status !== "billed") {
      return NextResponse.json(
        { ok: false, reason: `transaction_not_completed:${status || "unknown"}` },
        { status: 409 },
      );
    }

    const customDataBuyerId = txn.custom_data?.buyer_id ?? txn.custom_data?.userId;
    const txnBuyerId = customDataBuyerId == null ? null : Number(customDataBuyerId);
    if (!txnBuyerId || txnBuyerId !== Number(user.id)) {
      return NextResponse.json(
        { ok: false, reason: "transaction_user_mismatch" },
        { status: 403 },
      );
    }

    const kind = String(txn.custom_data?.kind ?? "").trim().toLowerCase();
    const priceId = txn.items?.[0]?.price?.id?.trim() || null;
    const isSpunkram =
      kind === "spunkram_subscription" || isSpunkramSubscriptionPriceId(priceId);

    if (isSpunkram && account !== "spunkram") {
      // Transaction lived in default account but looks like Spunkram — unusual;
      // still allow upsert so we don't strand the buyer.
      console.warn(
        `[subscriptions/claim] Spunkram-looking txn ${transactionId} resolved via default Paddle account`,
      );
    }

    if (!isSpunkram && kind && kind !== "spunkram_subscription") {
      // Keep this endpoint focused on Spunkram (and Motionsflow only when kind
      // is absent / matches a normal subscription checkout without kind).
      // Extra-generation packs have their own claim route.
      if (kind === "extra_ai_generations" || kind === "spunkram_item") {
        return NextResponse.json(
          { ok: false, reason: `unsupported_kind:${kind}` },
          { status: 400 },
        );
      }
    }

    const result = await upsertFromTransaction(
      txn as unknown as Parameters<typeof upsertFromTransaction>[0],
    );

    return NextResponse.json({
      ok: result.ok,
      reason: result.reason,
      buyerId: result.buyerId ?? txnBuyerId,
      subscriptionId: txn.subscription_id ?? null,
      account,
    });
  } catch (err) {
    if (err instanceof PaddleApiError) {
      console.warn(
        `[subscriptions/claim] Paddle API ${err.status} for txn ${transactionId}:`,
        err.message,
      );
      return NextResponse.json(
        { ok: false, reason: "paddle_api_error", status: err.status },
        { status: err.status === 404 ? 404 : 502 },
      );
    }
    console.error(`[subscriptions/claim] Unexpected error for txn ${transactionId}:`, err);
    return NextResponse.json({ error: "Failed to claim subscription" }, { status: 500 });
  }
}
