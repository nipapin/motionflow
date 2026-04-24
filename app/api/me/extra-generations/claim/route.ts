import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getGenerationsStatus } from "@/lib/generations";
import {
  applyExtraGenerationsCredit,
  extraGenerationsPackCountForPriceId,
} from "@/lib/paddle-server";
import { getTransaction, PaddleApiError } from "@/lib/paddle-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Client-initiated fallback that runs after `paddle.Checkout` fires the
 * `checkout.completed` event. Verifies the transaction with the Paddle API
 * (server-side, with our private key) and credits the buyer if the regular
 * `transaction.completed` webhook hasn't yet (or never will, e.g. local dev
 * without a webhook tunnel).
 *
 * Idempotency is enforced by the `paddle_transaction_id` PRIMARY KEY on
 * `paddle_extra_generation_credit_events` — the credit can be applied at most
 * once regardless of how many times the webhook + this endpoint race each other.
 *
 * Body: `{ transactionId: string }`
 * Response: `{ ok: true, credited: boolean, status }` on success.
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
    // fall-through: handled below
  }

  if (!transactionId) {
    return NextResponse.json(
      { error: "transactionId is required" },
      { status: 400 },
    );
  }

  try {
    const txn = await getTransaction(transactionId);

    // Only credit on terminal-success states. `completed` is the canonical
    // value for paid one-time charges; we accept `paid`/`billed` defensively
    // because Paddle has historically used both for instant captures.
    const status = String(txn.status ?? "").toLowerCase();
    if (status !== "completed" && status !== "paid" && status !== "billed") {
      return NextResponse.json(
        { ok: false, reason: `transaction_not_completed:${status || "unknown"}` },
        { status: 409 },
      );
    }

    const customDataUserId = txn.custom_data?.userId;
    const txnUserId = customDataUserId == null ? null : Number(customDataUserId);
    if (!txnUserId || txnUserId !== Number(user.id)) {
      return NextResponse.json(
        { ok: false, reason: "transaction_user_mismatch" },
        { status: 403 },
      );
    }

    const kind = String(txn.custom_data?.kind ?? "").trim().toLowerCase();
    if (kind !== "extra_ai_generations") {
      return NextResponse.json(
        { ok: false, reason: "transaction_not_extra_ai_generations" },
        { status: 400 },
      );
    }

    const priceId = txn.items?.[0]?.price?.id?.trim() || null;
    const packCount = extraGenerationsPackCountForPriceId(priceId);
    if (packCount == null) {
      return NextResponse.json(
        { ok: false, reason: "extra_generations_unknown_price_id" },
        { status: 400 },
      );
    }

    const result = await applyExtraGenerationsCredit(
      txn.id,
      Number(user.id),
      packCount,
    );

    const generationStatus = await getGenerationsStatus(Number(user.id));
    return NextResponse.json({
      ok: result.ok,
      credited:
        result.ok && result.reason !== "extra_generations_credit_already_applied",
      reason: result.reason,
      status: generationStatus,
    });
  } catch (err) {
    if (err instanceof PaddleApiError) {
      console.warn(
        `[extra-generations/claim] Paddle API ${err.status} for txn ${transactionId}:`,
        err.message,
      );
      return NextResponse.json(
        { ok: false, reason: "paddle_api_error", status: err.status },
        { status: err.status === 404 ? 404 : 502 },
      );
    }
    console.error(
      `[extra-generations/claim] Unexpected error for txn ${transactionId}:`,
      err,
    );
    return NextResponse.json(
      { error: "Failed to claim extra generations" },
      { status: 500 },
    );
  }
}
