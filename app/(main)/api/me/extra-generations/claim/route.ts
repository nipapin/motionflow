import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getCepSpunkramGenerationsStatus, getGenerationsStatus } from "@/lib/generations";
import { cepAiGenerationsLimit, getActiveAuthorSubscription } from "@/lib/cep-entitlements";
import { requireCepClientConfig } from "@/lib/cep-client-registry";
import {
  applyExtraGenerationsCredit,
  extraGenerationsPackCountForPriceId,
} from "@/lib/paddle-server";
import { getTransaction, PaddleApiError, type PaddleApiAccount } from "@/lib/paddle-api";
import { accountingSource, actualAccountingCatalog, spunkramSourceForBuyer } from "@/lib/paddle-actual";
import { isSpunkramExtraGenerationsPriceId, SPUNKRAM_AUTHOR_ID } from "@/lib/spunkram-paddle-config";
import { MOTIONFLOW_CREDITS_AUTHOR_ID } from "@/lib/user-generation-credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadExtraGenerationsTransaction(transactionId: string, preferred: PaddleApiAccount, buyerId: number) {
  const accounts: PaddleApiAccount[] = preferred === "spunkram" ? ["spunkram", "default"] : ["default", "spunkram"];
  for (const account of accounts) {
    const source = account === "spunkram" ? await spunkramSourceForBuyer(buyerId) : await accountingSource(account);
    try {
      return { txn: await getTransaction(transactionId, source), source };
    } catch (err) {
      if (account !== preferred || !(err instanceof PaddleApiError) || err.status !== 404) throw err;
    }
  }
  throw new Error("Paddle account unavailable");
}

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
  let preferred: PaddleApiAccount = "default";
  try {
    const body = (await request.json().catch(() => null)) as
      | { transactionId?: unknown; transaction_id?: unknown; authorId?: unknown }
      | null;
    const raw = body?.transactionId ?? body?.transaction_id;
    if (typeof raw === "string" && raw.trim()) {
      transactionId = raw.trim();
    }
    if (body?.authorId === SPUNKRAM_AUTHOR_ID) preferred = "spunkram";
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
    const { txn, source } = await loadExtraGenerationsTransaction(transactionId, preferred, user.id);

    const status = String(txn.status ?? "").toLowerCase();
    if (status !== "completed") {
      return NextResponse.json(
        { ok: false, reason: `transaction_not_completed:${status || "unknown"}` },
        { status: 409 },
      );
    }

    // Accept both the canonical `buyer_id` key (matches `subscription_systems.buyer_id`
    // / current checkout pages) and the legacy `userId` key for transactions
    // created before the rename.
    const customDataBuyerId =
      txn.custom_data?.buyer_id ?? txn.custom_data?.userId;
    const txnBuyerId =
      customDataBuyerId == null ? null : Number(customDataBuyerId);
    if (!txnBuyerId || txnBuyerId !== Number(user.id)) {
      return NextResponse.json(
        { ok: false, reason: "transaction_user_mismatch" },
        { status: 403 },
      );
    }

    const kind = String(txn.custom_data?.kind ?? "").trim().toLowerCase();
    const priceId = txn.items?.[0]?.price?.id?.trim() || null;
    const packCount = extraGenerationsPackCountForPriceId(priceId);
    const isExtraPurchase = kind === "extra_ai_generations" || packCount != null;
    if (!isExtraPurchase) {
      return NextResponse.json(
        { ok: false, reason: "transaction_not_extra_ai_generations" },
        { status: 400 },
      );
    }

    if (packCount == null) {
      return NextResponse.json(
        { ok: false, reason: "extra_generations_unknown_price_id" },
        { status: 400 },
      );
    }

    const authorId = isSpunkramExtraGenerationsPriceId(priceId)
      ? SPUNKRAM_AUTHOR_ID
      : MOTIONFLOW_CREDITS_AUTHOR_ID;

    if (source.environment === "sandbox" &&
        (authorId !== SPUNKRAM_AUTHOR_ID || !actualAccountingCatalog().sandboxBuyerIds.includes(Number(user.id)))) {
      return NextResponse.json({ ok: false, reason: "sandbox_buyer_not_enabled" }, { status: 403 });
    }

    const result = await applyExtraGenerationsCredit(
      txn.id,
      Number(user.id),
      packCount,
      authorId,
    );

    const subscription = authorId === SPUNKRAM_AUTHOR_ID
      ? await getActiveAuthorSubscription(Number(user.id), authorId)
      : null;
    const generationStatus = subscription
      ? await getCepSpunkramGenerationsStatus(Number(user.id),
        cepAiGenerationsLimit(requireCepClientConfig("spunkram-cep"), subscription), subscription.active, authorId)
      : await getGenerationsStatus(Number(user.id));
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
