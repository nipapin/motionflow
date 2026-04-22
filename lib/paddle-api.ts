import "server-only";

/**
 * Thin server-side wrapper over the Paddle Billing REST API.
 *
 * Docs: https://developer.paddle.com/api-reference/overview
 *
 * We only implement what we need from this app: read a subscription, update
 * it for a scheduled downgrade or to clear the schedule, and cancel
 * leftover active subscriptions when the buyer purchases a new plan
 * (so the "one active subscription per buyer_id" invariant holds).
 *
 * The base URL is derived from `NEXT_PUBLIC_PADDLE_ENVIRONMENT` so that
 * the client and the server target the same environment.
 *
 * Required env:
 *   PADDLE_API_KEY                — Server-side key (Dashboard → Developer tools → Authentication)
 *   NEXT_PUBLIC_PADDLE_ENVIRONMENT — "sandbox" | "production" (defaults to sandbox)
 */

const SANDBOX_BASE = "https://sandbox-api.paddle.com";
const PRODUCTION_BASE = "https://api.paddle.com";

function getBaseUrl(): string {
  const env = (process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT ?? "sandbox").toLowerCase();
  return env === "production" ? PRODUCTION_BASE : SANDBOX_BASE;
}

function getApiKey(): string {
  const key = process.env.PADDLE_API_KEY;
  if (!key) {
    throw new Error(
      "PADDLE_API_KEY is not configured. Add it to your environment to enable subscription management.",
    );
  }
  return key;
}

export class PaddleApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "PaddleApiError";
    this.status = status;
    this.body = body;
  }
}

async function paddleFetch<T>(
  path: string,
  init: RequestInit & { idempotencyKey?: string } = {},
): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${getApiKey()}`);
  headers.set("Content-Type", "application/json");
  if (init.idempotencyKey) {
    // HTTP headers are ByteString — every char must be in 0x00–0xFF. If a
    // caller accidentally interpolates a value with non-ASCII chars (e.g.
    // a JS Date stringified on a Windows locale that includes a Cyrillic
    // timezone name), `headers.set` throws and we'd lose the call. Strip
    // non-ASCII defensively while keeping the key recognisable.
    const sanitized = init.idempotencyKey.replace(/[^\x20-\x7E]/g, "_");
    headers.set("Paddle-Idempotency-Key", sanitized);
  }

  const res = await fetch(url, { ...init, headers, cache: "no-store" });
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }
  if (!res.ok) {
    const message =
      (json && typeof json === "object" && "error" in json && (json as { error?: { detail?: string } }).error?.detail) ||
      `Paddle API ${path} failed with ${res.status}`;
    throw new PaddleApiError(String(message), res.status, json);
  }
  return (json as { data: T })?.data as T;
}

/* -------------------------------------------------------------------------- */
/*  Types (only the fields we actually consume)                                */
/* -------------------------------------------------------------------------- */

export interface PaddleApiSubscription {
  id: string;
  status: "active" | "trialing" | "past_due" | "paused" | "canceled";
  customer_id: string;
  address_id?: string | null;
  business_id?: string | null;
  currency_code?: string | null;
  collection_mode?: "automatic" | "manual" | string | null;
  discount?: { id?: string | null; effective_from?: string | null } | null;
  custom_data?: { userId?: string | number; plan?: string; billingPeriod?: string } | null;
  current_billing_period?: { starts_at: string; ends_at: string } | null;
  next_billed_at?: string | null;
  scheduled_change?: {
    action: "cancel" | "pause" | "resume" | string;
    effective_at: string;
    resume_at?: string | null;
  } | null;
  items?: Array<{
    status?: string;
    quantity?: number;
    recurring?: boolean;
    price?: {
      id?: string;
      product_id?: string;
      name?: string | null;
      billing_cycle?: { interval: string; frequency: number } | null;
      unit_price?: { amount?: string | null; currency_code?: string | null } | null;
    } | null;
  }>;
}

/**
 * Standalone Paddle Price entity (returned by GET /prices/{id}).
 * We only consume what the upgrade-fee calculation needs.
 */
export interface PaddleApiPrice {
  id: string;
  product_id: string;
  name?: string | null;
  unit_price?: { amount?: string | null; currency_code?: string | null } | null;
  billing_cycle?: { interval: string; frequency: number } | null;
}

/* -------------------------------------------------------------------------- */
/*  Operations                                                                 */
/* -------------------------------------------------------------------------- */

export async function getSubscription(id: string): Promise<PaddleApiSubscription> {
  return paddleFetch<PaddleApiSubscription>(
    `/subscriptions/${encodeURIComponent(id)}?include=next_transaction`,
    { method: "GET" },
  );
}

/**
 * Schedule the current subscription to cancel at the end of its billing
 * period. This is the only Paddle-native way to "delay" a subscription
 * change — Paddle's PATCH /subscriptions endpoint applies item swaps
 * immediately for every `proration_billing_mode`, so there is no native
 * "swap items at next period" call.
 *
 * Per Paddle docs (https://developer.paddle.com/api-reference/subscriptions/cancel-subscription):
 *   - omitting `effective_from` defaults to `next_billing_period`
 *   - subscription stays `status="active"` with `scheduled_change.action="cancel"`
 *     and `effective_at = current_billing_period.ends_at`
 *   - on the effective date Paddle flips `status` to `canceled` and fires
 *     `subscription.canceled` (which we use to fire the auto re-subscribe
 *     for the chosen downgrade target).
 */
export async function scheduleSubscriptionCancellationAtPeriodEnd(
  subscriptionId: string,
  options: { idempotencyKey?: string } = {},
): Promise<PaddleApiSubscription> {
  return paddleFetch<PaddleApiSubscription>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    {
      method: "POST",
      idempotencyKey: options.idempotencyKey,
      body: JSON.stringify({ effective_from: "next_billing_period" }),
    },
  );
}

/**
 * Swap subscription items without billing the buyer. Paddle just rewrites the
 * subscription's items and updates the next-billing amount; no transaction is
 * created. We use this for upgrades AFTER charging the buyer our own custom
 * prorated amount via {@link createOneTimeChargeOnSubscription}, because
 * Paddle's built-in `prorated_immediately` doesn't match the Motionflow
 * formula (`newPlan − oldPlan × usedDays / days`).
 */
export async function swapSubscriptionItemsWithoutBilling(
  subscriptionId: string,
  targetPriceId: string,
  options: { quantity?: number; idempotencyKey?: string } = {},
): Promise<PaddleApiSubscription> {
  return paddleFetch<PaddleApiSubscription>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      method: "PATCH",
      idempotencyKey: options.idempotencyKey,
      body: JSON.stringify({
        items: [{ price_id: targetPriceId, quantity: options.quantity ?? 1 }],
        proration_billing_mode: "do_not_bill",
      }),
    },
  );
}

/**
 * Drop a previously scheduled change (downgrade or cancel) by setting
 * `scheduled_change` to null on the subscription.
 */
export async function clearScheduledChange(
  subscriptionId: string,
  options: { idempotencyKey?: string } = {},
): Promise<PaddleApiSubscription> {
  return paddleFetch<PaddleApiSubscription>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      method: "PATCH",
      idempotencyKey: options.idempotencyKey,
      body: JSON.stringify({ scheduled_change: null }),
    },
  );
}

/**
 * Cancel a subscription. We only ever use this on rows that have been
 * superseded by a brand-new checkout (= upgrade path), so the default is
 * `effective_from: immediately` to avoid double-billing the user.
 */
export async function cancelSubscriptionImmediately(
  subscriptionId: string,
  options: { idempotencyKey?: string } = {},
): Promise<PaddleApiSubscription> {
  return paddleFetch<PaddleApiSubscription>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    {
      method: "POST",
      idempotencyKey: options.idempotencyKey,
      body: JSON.stringify({ effective_from: "immediately" }),
    },
  );
}

/* -------------------------------------------------------------------------- */
/*  Transactions API (used by auto re-subscribe after a scheduled downgrade)  */
/* -------------------------------------------------------------------------- */

export interface PaddleApiTransaction {
  id: string;
  status: string;
  customer_id?: string | null;
  subscription_id?: string | null;
  invoice_id?: string | null;
  invoice_number?: string | null;
}

/**
 * Create a billed transaction for a recurring price using the customer's
 * saved payment method. Paddle bills the card and, for recurring prices,
 * creates a brand-new subscription bound to that customer.
 *
 * This is how we implement the "auto switch to lower plan when the previous
 * subscription cancels at period end" downgrade flow:
 *
 *   1. user picks a downgrade  → POST /api/subscription/schedule-downgrade
 *   2. we schedule cancel of the current sub for `current_billing_period.ends_at`
 *   3. on the `subscription.canceled` webhook for that sub we look up the
 *      target price we stored and call this helper with `collection_mode=automatic`
 *   4. Paddle charges the customer's card and emits `transaction.completed`
 *      → our existing webhook handler creates the new `subscription_systems` row
 *
 * Docs: https://developer.paddle.com/api-reference/transactions/create-transaction
 */
export async function createBilledRecurringTransaction(
  params: {
    customerId: string;
    priceId: string;
    quantity?: number;
    addressId?: string | null;
    businessId?: string | null;
    currencyCode?: string | null;
    discountId?: string | null;
    customData?: Record<string, unknown> | null;
  },
  options: { idempotencyKey?: string } = {},
): Promise<PaddleApiTransaction> {
  const body: Record<string, unknown> = {
    customer_id: params.customerId,
    items: [{ price_id: params.priceId, quantity: params.quantity ?? 1 }],
    collection_mode: "automatic",
  };
  if (params.addressId) body.address_id = params.addressId;
  if (params.businessId) body.business_id = params.businessId;
  if (params.currencyCode) body.currency_code = params.currencyCode;
  if (params.discountId) body.discount = { id: params.discountId, effective_from: "immediately" };
  if (params.customData && Object.keys(params.customData).length > 0) {
    body.custom_data = params.customData;
  }

  return paddleFetch<PaddleApiTransaction>(`/transactions`, {
    method: "POST",
    idempotencyKey: options.idempotencyKey,
    body: JSON.stringify(body),
  });
}

/* -------------------------------------------------------------------------- */
/*  Prices & one-time charges (used by the custom-formula upgrade flow)        */
/* -------------------------------------------------------------------------- */

export async function getPrice(priceId: string): Promise<PaddleApiPrice> {
  return paddleFetch<PaddleApiPrice>(
    `/prices/${encodeURIComponent(priceId)}`,
    { method: "GET" },
  );
}

/**
 * Create a one-time charge on an existing subscription with a non-catalog
 * price (so we can bill ANY arbitrary amount, not just a price configured in
 * the Paddle dashboard).
 *
 * Used by the upgrade flow to charge the Motionflow-formula prorated fee:
 *
 *   amountDue = newPlanCost − oldPlanCost × (usedDays / billingPeriodDays)
 *
 * Paddle bills the customer's saved payment method immediately and emits
 * `transaction.created` + `transaction.completed` (both already wired into
 * our webhook handler — they don't disturb the subscription_systems row
 * because the transaction is a one-off, not a recurring item).
 *
 * Notes:
 *  - `unit_price.amount` is in MINOR units, e.g. cents for USD.
 *  - We pass `tax_mode: "account_setting"` so Paddle applies the same tax
 *    treatment configured on the account (matches the regular checkout).
 *  - `effective_from: "immediately"` triggers a card charge right now;
 *    the response is the updated Subscription, but the new transaction id
 *    isn't included in the response — we discover it via webhooks.
 *
 * Docs: https://developer.paddle.com/api-reference/subscriptions/create-one-time-charge
 */
export async function createOneTimeChargeOnSubscription(
  subscriptionId: string,
  params: {
    productId: string;
    amountMinor: string;
    currencyCode: string;
    description: string;
    name: string;
    quantity?: number;
  },
  options: { idempotencyKey?: string } = {},
): Promise<PaddleApiSubscription> {
  return paddleFetch<PaddleApiSubscription>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}/charge`,
    {
      method: "POST",
      idempotencyKey: options.idempotencyKey,
      body: JSON.stringify({
        effective_from: "immediately",
        on_payment_failure: "prevent_change",
        items: [
          {
            quantity: params.quantity ?? 1,
            price: {
              description: params.description,
              name: params.name,
              billing_cycle: null,
              trial_period: null,
              tax_mode: "account_setting",
              unit_price: {
                amount: params.amountMinor,
                currency_code: params.currencyCode,
              },
              product_id: params.productId,
              quantity: { minimum: 1, maximum: 1 },
            },
          },
        ],
      }),
    },
  );
}

/* -------------------------------------------------------------------------- */
/*  Motionflow custom proration helper                                         */
/* -------------------------------------------------------------------------- */

/**
 * Computes the Motionflow upgrade fee in MINOR units (cents).
 *
 * Formula (credits the buyer for the UNUSED portion of the current plan):
 *
 *   credit = oldPlan × (unusedDays / billingPeriodDays)
 *   amount = newPlan − credit
 *
 * Where:
 *  - `oldPlan` and `newPlan` are the unit prices of the current and target
 *    Paddle prices (subtotal, no tax).
 *  - `billingPeriodDays = ceil((ends_at − starts_at) / 1 day)`
 *  - `usedDays = clamp(floor((today − starts_at) / 1 day) + 1, 1, billingPeriodDays)`
 *    (the day the upgrade happens counts as already used).
 *  - `unusedDays = billingPeriodDays − usedDays` (≥ 0)
 *
 * Sanity examples for $18 → $36 monthly (30-day period):
 *   - day 1:  credit = 18 × 29/30 = $17.40 → amount = 36 − 17.40 = $18.60
 *   - day 10: credit = 18 × 20/30 = $12.00 → amount = 36 − 12.00 = $24.00
 *   - day 30: credit = 18 ×  0/30 =  $0.00 → amount = 36 −  0.00 = $36.00
 *
 * If the formula yields ≤ 0 (e.g. credit on a much cheaper new plan) we
 * floor at 0 — Paddle rejects zero-amount charges, so the caller should
 * skip the charge step in that case.
 */
export function computeMotionflowUpgradeFeeMinor(params: {
  oldPlanMinor: number;
  newPlanMinor: number;
  periodStart: string;
  periodEnd: string;
  /** Override "today" for tests; defaults to Date.now(). */
  now?: Date;
}): {
  amountMinor: number;
  usedDays: number;
  unusedDays: number;
  periodDays: number;
  creditMinor: number;
} {
  const start = new Date(params.periodStart).getTime();
  const end = new Date(params.periodEnd).getTime();
  const today = (params.now ?? new Date()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  const periodDays = Math.max(1, Math.ceil((end - start) / dayMs));
  const usedDaysRaw = Math.floor((today - start) / dayMs) + 1;
  const usedDays = Math.min(periodDays, Math.max(1, usedDaysRaw));
  const unusedDays = Math.max(0, periodDays - usedDays);

  const creditMinor = Math.round((params.oldPlanMinor * unusedDays) / periodDays);
  const amountMinor = Math.max(0, Math.round(params.newPlanMinor - creditMinor));

  return { amountMinor, usedDays, unusedDays, periodDays, creditMinor };
}
