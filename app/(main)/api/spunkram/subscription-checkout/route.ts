import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getActiveAuthorSubscription } from "@/lib/cep-entitlements";
import { getPool } from "@/lib/db";
import { isSpunkramSandboxBuyer, spunkramSourceForBuyer } from "@/lib/paddle-actual";
import { cancelCheckoutTransaction, createCheckoutTransaction, getTransaction } from "@/lib/paddle-api";
import { isSpunkramCheckoutEnabled, spunkramLocalSandbox } from "@/lib/spunkram-paddle-credentials";
import { SPUNKRAM_AUTHOR_ID, spunkramPricesForEnvironment } from "@/lib/spunkram-paddle-config";

type Intent = RowDataPacket & {
  attempt_id: string;
  transaction_id: string;
  price_id: string;
  expired: number;
};

const attemptPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function checkout(request: Request, close: boolean) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { attemptId?: unknown; tier?: unknown; billing?: unknown } | null;
  const attemptId = body?.attemptId;
  if (typeof attemptId !== "string" || !attemptPattern.test(attemptId)) {
    return NextResponse.json({ error: "invalid_attempt" }, { status: 400 });
  }

  const sandboxBuyer = isSpunkramSandboxBuyer(user.id);
  const source = await spunkramSourceForBuyer(user.id);
  if (!close && !sandboxBuyer && !spunkramLocalSandbox && !await isSpunkramCheckoutEnabled()) {
    return NextResponse.json({ error: "checkout_disabled" }, { status: 403 });
  }
  if (spunkramLocalSandbox && !sandboxBuyer) return NextResponse.json({ preview: true });

  const tier = body?.tier;
  const billing = body?.billing;
  const priceId = (tier === "library" || tier === "ai_toolkit") && (billing === "monthly" || billing === "yearly")
    ? spunkramPricesForEnvironment(source.environment)[tier][billing] : "";
  if (!close && !priceId.startsWith("pri_")) {
    return NextResponse.json({ error: "invalid_price" }, { status: 400 });
  }

  const connection = await getPool().getConnection();
  const lock = `spunkram_checkout:${source.environment}:${user.id}`;
  const key = [user.id, source.environment];
  let locked = false;
  try {
    const [[row]] = await connection.query<RowDataPacket[]>("SELECT GET_LOCK(?, 4) AS acquired", [lock]);
    locked = row?.acquired === 1;
    if (!locked) return NextResponse.json({ error: "checkout_pending" }, { status: 409 });
    if (!close && (await getActiveAuthorSubscription(user.id, SPUNKRAM_AUTHOR_ID, connection)).active) {
      return NextResponse.json({ error: "subscription_active" }, { status: 409 });
    }
    const [[intent]] = await connection.execute<Intent[]>(
      "SELECT attempt_id, transaction_id, price_id, expires_at <= UTC_TIMESTAMP() AS expired FROM spunkram_checkout_intents WHERE buyer_id=? AND environment=?",
      key,
    );

    if (close && intent?.attempt_id !== attemptId) return NextResponse.json({ ok: true });
    if (intent) {
      const transaction = await getTransaction(intent.transaction_id, source);
      if (transaction.status === "draft" || transaction.status === "ready") {
        if (!close && !intent.expired) {
          return intent.attempt_id === attemptId && intent.price_id === priceId
            ? NextResponse.json({ transactionId: intent.transaction_id })
            : NextResponse.json({ error: "checkout_pending" }, { status: 409 });
        }
        const cancelled = await cancelCheckoutTransaction(intent.transaction_id, source);
        if (cancelled.status !== "canceled") return NextResponse.json({ error: "checkout_pending" }, { status: 409 });
      } else if (transaction.status !== "canceled") {
        // Leave a captured payment reserved while its webhook grants access.
        // A completed intent may be superseded only after the billed period.
        const end = Date.parse(transaction.billing_period?.ends_at ?? "");
        const [[refunded]] = transaction.status === "completed"
          ? await connection.execute<RowDataPacket[]>(
            "SELECT id FROM subscription_systems WHERE buyer_id=? AND author_id=? AND payment_id=? AND paddle_refunded_at IS NOT NULL",
            [user.id, SPUNKRAM_AUTHOR_ID, intent.transaction_id],
          ) : [[]];
        if (close || transaction.status !== "completed" || (!refunded && !(end <= Date.now()))) {
          return NextResponse.json({ error: "checkout_pending" }, { status: 409 });
        }
      }
    }
    if (close) {
      await connection.execute("DELETE FROM spunkram_checkout_intents WHERE buyer_id=? AND environment=?", key);
      return NextResponse.json({ ok: true });
    }

    const transaction = await createCheckoutTransaction(priceId, {
      buyer_id: String(user.id), author_id: String(SPUNKRAM_AUTHOR_ID), kind: "spunkram_subscription",
      billingPeriod: billing, tier,
    }, source);
    await connection.execute(
      `INSERT INTO spunkram_checkout_intents (buyer_id, environment, attempt_id, transaction_id, price_id, expires_at)
       VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP() + INTERVAL 20 MINUTE)
       ON DUPLICATE KEY UPDATE attempt_id=VALUES(attempt_id), transaction_id=VALUES(transaction_id),
       price_id=VALUES(price_id), expires_at=VALUES(expires_at)`,
      [...key, attemptId, transaction.id, priceId],
    );
    return NextResponse.json({ transactionId: transaction.id });
  } catch (error) {
    console.error("[spunkram] subscription checkout failed", error);
    return NextResponse.json({ error: "checkout_unavailable" }, { status: 503 });
  } finally {
    if (!locked) {
      connection.release();
    } else {
      try {
        await connection.query("SELECT RELEASE_LOCK(?)", [lock]);
        connection.release();
      } catch {
        connection.destroy();
      }
    }
  }
}

export function POST(request: Request) {
  return checkout(request, false);
}

export function DELETE(request: Request) {
  return checkout(request, true);
}
