import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import {
  applyMotionflowProductTitleTemplate,
  normalizePaddleProductNameToken,
} from "@/lib/paddle-product-label";
import { isExtraGenerationsPackPriceId } from "@/lib/extra-generation-packs";

/** Motionflow catalog tier used for AI generation quotas (`/api/me/generations`). */
export type MotionflowGenerationPlan = "none" | "creator" | "creator_ai";

export interface SubscriptionListItem {
  subsFor: string;
  plan: string | null;
  subscriptionId: string;
  icon: string;
  invertIcon: boolean;
  productPage: string;
  /** Paddle catalog ids when stored (`pro_…` / `pri_…`). */
  paddleProductId: string | null;
  paddlePriceId: string | null;
  /** Raw display name from Paddle when stored (see `subsFor` for resolved title). */
  paddleProductName: string | null;
  active: boolean;
  cancelled: boolean;
  endDate: string | null;
  endsAt: string | null;
}

export function formatTokenPreview(id: string): string {
  if (id.length <= 28) return id;
  return `${id.slice(0, 16)} \u2026 ${id.slice(-4)}`;
}

type SubRow = RowDataPacket & {
  id: number;
  author_id: number | null;
  status: number;
  subscription_id: string;
  plan: string | null;
  ends_at: string | null;
  created_at: string | null;
  paddle_product_id: string | null;
  paddle_price_id: string | null;
  paddle_product_name: string | null;
  paddle_billing_period_starts_at: string | null;
  paddle_billing_period_ends_at: string | null;
  scheduled_change_action: string | null;
  scheduled_change_effective_at: string | null;
  scheduled_change_paddle_product_id: string | null;
  scheduled_change_paddle_price_id: string | null;
  scheduled_change_paddle_product_name: string | null;
  scheduled_change_plan: string | null;
};

const TITLES: Record<number | string, string> = {
  4141: "Premiere Gal Toolkit MAX",
  1691: "Spunkram Library",
};

/**
 * Labels / URLs / icons by Paddle product id (`pro_…`), when present on the row.
 * Add entries from Catalog → Products in the Paddle dashboard.
 */
const PADDLE_PRODUCT_TITLES: Record<string, string> = {};

const PADDLE_PRODUCT_PAGES: Record<string, string> = {
  "": "https://motionflow.pro",
};

const PADDLE_PRODUCT_ICONS: Record<string, string> = {
  "": "/assets/logo_square.png",
};

/** `author_id` values that are separate third‑party bundles; they are not the main Motionflow catalog subscription. */
const THIRD_PARTY_SUBSCRIPTION_AUTHOR_IDS = new Set<number>([4141, 1691]);

/** Same as `THIRD_PARTY_SUBSCRIPTION_AUTHOR_IDS` but for rows keyed by Paddle `pro_…` (fill when you know catalog ids). */
const THIRD_PARTY_PADDLE_PRODUCT_IDS = new Set<string>([]);

function rowIsMotionflowCatalogSubscription(r: SubRow): boolean {
  const pid = r.paddle_product_id?.trim();
  if (pid && THIRD_PARTY_PADDLE_PRODUCT_IDS.has(pid)) return false;
  if (r.author_id == null) return true;
  return !THIRD_PARTY_SUBSCRIPTION_AUTHOR_IDS.has(r.author_id);
}

/** Extra AI generation packs are purchases, not recurring subscriptions (even if stored on the same table). */
function rowIsBillableMotionflowSubscription(r: SubRow): boolean {
  return (
    rowIsMotionflowCatalogSubscription(r) &&
    !isExtraGenerationsPackPriceId(r.paddle_price_id?.trim())
  );
}

const PRODUCT_PAGES: Record<number | string, string> = {
  4141: "https://premieregal.motionflow.pro",
  1691: "https://spunkram.motionflow.pro",
  "": "https://motionflow.pro",
};

const ICONS: Record<number | string, string> = {
  4141: "/assets/logo.png",
  1691: "/assets/spunkram-logo.png",
  "": "/assets/logo_square.png",
};

/** Main catalog: `MOTIONFLOW_SUBSCRIPTION_TITLE_TEMPLATE`; third‑party: normalized name only. */
function formatMotionflowCatalogTitle(r: SubRow, raw: string): string {
  if (!rowIsMotionflowCatalogSubscription(r)) {
    return normalizePaddleProductNameToken(raw) || raw.trim();
  }
  return applyMotionflowProductTitleTemplate(raw);
}

function resolveSubscriptionPresentation(r: SubRow): {
  subsFor: string;
  icon: string;
  productPage: string;
  invertIcon: boolean;
} {
  // Highest-confidence: when the row's `paddle_price_id` matches a catalog
  // price, the tier is canonical and we ignore whatever `paddle_product_name`
  // happens to hold (one-time charges, prorated upgrade fees, mis-named
  // products in Paddle dashboard etc. should never leak into the UI title).
  const catalogTier = catalogTierFromRow(r);
  if (catalogTier) {
    return {
      subsFor: applyMotionflowProductTitleTemplate(MOTIONFLOW_TIER_TOKENS[catalogTier]),
      icon: ICONS[""],
      productPage: PRODUCT_PAGES[""],
      invertIcon: true,
    };
  }

  const paddlePid = r.paddle_product_id?.trim() ?? "";
  if (paddlePid && PADDLE_PRODUCT_TITLES[paddlePid]) {
    const icon = PADDLE_PRODUCT_ICONS[paddlePid] ?? PADDLE_PRODUCT_ICONS[""];
    const hasBrandedIcon = paddlePid in PADDLE_PRODUCT_ICONS && PADDLE_PRODUCT_ICONS[paddlePid] !== PADDLE_PRODUCT_ICONS[""];
    return {
      subsFor: formatMotionflowCatalogTitle(r, PADDLE_PRODUCT_TITLES[paddlePid]),
      icon,
      productPage: PADDLE_PRODUCT_PAGES[paddlePid] ?? PADDLE_PRODUCT_PAGES[""],
      invertIcon: !hasBrandedIcon,
    };
  }

  const paddleName = r.paddle_product_name?.trim();
  if (paddleName) {
    return {
      subsFor: formatMotionflowCatalogTitle(r, paddleName),
      icon: ICONS[""],
      productPage: PRODUCT_PAGES[""],
      invertIcon: true,
    };
  }

  const authorKey = r.author_id ?? "";
  const hasKnownAuthor = r.author_id != null && r.author_id in ICONS;
  return {
    subsFor: TITLES[authorKey] ?? applyMotionflowProductTitleTemplate("Subscription"),
    icon: ICONS[authorKey] ?? ICONS[""],
    productPage: PRODUCT_PAGES[authorKey] ?? PRODUCT_PAGES[""],
    invertIcon: !hasKnownAuthor,
  };
}

/** Canonical token piece used inside `Motionflow %ProductName%`. */
const MOTIONFLOW_TIER_TOKENS: Record<PricingTier, string> = {
  creator: "Creator",
  creator_ai: "Creator AI",
};

/**
 * Returns "creator" | "creator_ai" if the row's `paddle_price_id` is one of
 * the four catalog prices configured via env. Returns `null` otherwise.
 *
 * Keeping this lookup-only (no name parsing) means that even a row with a
 * weird `paddle_product_name` (e.g. left over from a one-time upgrade charge
 * before the side-charge skip was added in `paddle-server.ts`) will still
 * render with the correct canonical title.
 */
function catalogTierFromRow(r: SubRow): PricingTier | null {
  const priceId = r.paddle_price_id?.trim();
  if (!priceId) return null;
  const hit = CATALOG_PRICE_LOOKUP.get(priceId);
  return hit?.tier ?? null;
}

function formatDateDMY(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

const TABLE = "subscription_systems";

const LIST_SUBSCRIPTION_SQL = `SELECT author_id, status, subscription_id, plan, ends_at, created_at,
            paddle_product_id, paddle_price_id, paddle_product_name
     FROM \`${TABLE}\`
     WHERE buyer_id = ?
     ORDER BY id DESC`;

/** When set, access ends after this instant (Paddle / DB `ends_at`). */
function endsAtStillValid(endsAt: string | null): boolean {
  if (!endsAt) return true;
  return new Date(endsAt) > new Date();
}

function computeRowActiveState(r: SubRow): { active: boolean; cancelled: boolean } {
  let active = false;
  let cancelled = false;

  if (r.ends_at && r.status === -1) {
    cancelled = true;
    if (endsAtStillValid(r.ends_at)) {
      active = true;
    }
  } else if (r.status === 1) {
    active = endsAtStillValid(r.ends_at);
  }

  return { active, cancelled };
}

export async function getSubscriptionsForUser(
  userId: number,
): Promise<SubscriptionListItem[]> {
  const pool = getPool();
  const [rows] = await pool.execute<SubRow[]>(LIST_SUBSCRIPTION_SQL, [userId]);

  return rows.filter((r) => rowIsBillableMotionflowSubscription(r)).map((r) => {
    const pres = resolveSubscriptionPresentation(r);

    const { active, cancelled } = computeRowActiveState(r);
    const endDate: string | null = formatDateDMY(r.ends_at);

    return {
      ...pres,
      plan: r.plan ?? null,
      subscriptionId: String(r.subscription_id ?? ""),
      paddleProductId: r.paddle_product_id?.trim() ?? null,
      paddlePriceId: r.paddle_price_id?.trim() ?? null,
      paddleProductName: r.paddle_product_name?.trim() ?? null,
      active,
      cancelled,
      endDate,
      endsAt: r.ends_at ?? null,
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Active subscription summary (drives the pricing page UI)                  */
/* -------------------------------------------------------------------------- */

export type PricingTier = "creator" | "creator_ai";
export type PricingBillingPeriod = "monthly" | "yearly";

export interface ScheduledPlanChangeSummary {
  /** "update" → swap to a different plan; "cancel"/"pause" → simple end. */
  action: string;
  effectiveAt: string;
  /** Resolved tier/period if Paddle scheduled an item swap that we recognise. */
  tier: PricingTier | null;
  billingPeriod: PricingBillingPeriod | null;
  /** Raw Paddle ids in case the new plan is not in our catalog map yet. */
  paddleProductId: string | null;
  paddlePriceId: string | null;
  paddleProductName: string | null;
}

export interface ActiveSubscriptionSummary {
  paddleSubscriptionId: string;
  tier: PricingTier;
  billingPeriod: PricingBillingPeriod;
  /** End of the current paid period (next renewal date for active subs). */
  currentPeriodEnd: string | null;
  /** Cancelled but still in a paid grace period. */
  cancelled: boolean;
  scheduledChange: ScheduledPlanChangeSummary | null;
}

function dbPlanToBillingPeriod(plan: string | null | undefined): PricingBillingPeriod {
  // Paddle yearly cycles map to DB enum 'annual'; everything else collapses to monthly for UI purposes.
  const v = (plan ?? "").toLowerCase();
  if (v === "annual" || v === "yearly") return "yearly";
  return "monthly";
}

/**
 * Maps every catalog price id we know about (`NEXT_PUBLIC_PADDLE_PRICE_…`)
 * back to its (tier, billingPeriod). Used for resolving the *target* of a
 * scheduled downgrade — the row only stores the price id, not the tier.
 */
const CATALOG_PRICE_LOOKUP: Map<string, { tier: PricingTier; billingPeriod: PricingBillingPeriod }> = new Map(
  (
    [
      [process.env.NEXT_PUBLIC_PADDLE_PRICE_CREATOR_MONTHLY, "creator", "monthly"] as const,
      [process.env.NEXT_PUBLIC_PADDLE_PRICE_CREATOR_YEARLY, "creator", "yearly"] as const,
      [process.env.NEXT_PUBLIC_PADDLE_PRICE_CREATOR_AI_MONTHLY, "creator_ai", "monthly"] as const,
      [process.env.NEXT_PUBLIC_PADDLE_PRICE_CREATOR_AI_YEARLY, "creator_ai", "yearly"] as const,
    ] as ReadonlyArray<readonly [string | undefined, PricingTier, PricingBillingPeriod]>
  )
    .filter(([id]) => typeof id === "string" && id.length > 0)
    .map(([id, tier, billingPeriod]) => [id as string, { tier, billingPeriod }]),
);

function rowToActiveSummary(r: SubRow): ActiveSubscriptionSummary {
  const tier: PricingTier = rowIsCreatorPlusAi(r) ? "creator_ai" : "creator";
  const billingPeriod = dbPlanToBillingPeriod(r.plan);

  let scheduledChange: ScheduledPlanChangeSummary | null = null;
  if (r.scheduled_change_action && r.scheduled_change_effective_at) {
    const sName = r.scheduled_change_paddle_product_name?.trim() || null;
    const sPriceId = r.scheduled_change_paddle_price_id?.trim() || null;
    const sProductId = r.scheduled_change_paddle_product_id?.trim() || null;

    let nextTier: PricingTier | null = null;
    let nextBillingPeriod: PricingBillingPeriod | null = r.scheduled_change_plan
      ? dbPlanToBillingPeriod(r.scheduled_change_plan)
      : null;

    // Highest-confidence resolution first: catalog price id from env.
    const catalogHit = sPriceId ? CATALOG_PRICE_LOOKUP.get(sPriceId) : null;
    if (catalogHit) {
      nextTier = catalogHit.tier;
      nextBillingPeriod = catalogHit.billingPeriod;
    } else if (sPriceId && CREATOR_AI_PADDLE_PRICE_IDS.has(sPriceId)) {
      nextTier = "creator_ai";
    } else if (sProductId && CREATOR_AI_PADDLE_PRODUCT_IDS.has(sProductId)) {
      nextTier = "creator_ai";
    } else if (sName) {
      nextTier = resolveCreatorTierFromNameToken(normalizePaddleProductNameToken(sName));
    }

    scheduledChange = {
      action: r.scheduled_change_action,
      effectiveAt: r.scheduled_change_effective_at,
      tier: nextTier,
      billingPeriod: nextBillingPeriod,
      paddleProductId: sProductId,
      paddlePriceId: sPriceId,
      paddleProductName: sName,
    };
  }

  return {
    paddleSubscriptionId: String(r.subscription_id ?? ""),
    tier,
    billingPeriod,
    currentPeriodEnd: r.paddle_billing_period_ends_at ?? r.ends_at ?? null,
    cancelled: r.status === -1,
    scheduledChange,
  };
}

/**
 * Single active Motionflow catalog subscription for a buyer, or null.
 *
 * The DB invariant we maintain is "at most one active Motionflow row per
 * buyer_id" (enforced in `paddle-server.ts` by cancelling stale rows when a
 * new transaction completes). If multiple active rows somehow coexist we
 * prefer Creator + AI > Creator (newest within tier wins).
 */
export async function getActiveSubscriptionForUser(
  userId: number,
): Promise<ActiveSubscriptionSummary | null> {
  const pool = getPool();
  const [rows] = await pool.execute<SubRow[]>(GENERATION_SUBSCRIPTION_SQL, [userId]);

  const activeCatalog = rows.filter(
    (r) => rowIsBillableMotionflowSubscription(r) && rowIsActive(r),
  );
  if (activeCatalog.length === 0) return null;
  const tierRow = pickTierRowForGenerations(activeCatalog);
  if (!tierRow) return null;
  return rowToActiveSummary(tierRow);
}

function rowIsActive(r: SubRow): boolean {
  return computeRowActiveState(r).active;
}

/**
 * Active Motionflow catalog subscription (see `MOTIONFLOW_SUBSCRIPTION_TITLE_TEMPLATE` in `paddle-product-label.ts`).
 * Third‑party author bundles (e.g. Premiere Gal, Spunkram) do not unlock unlimited marketplace downloads.
 */
export async function hasActiveMotionflowSubscription(
  userId: number,
): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.execute<SubRow[]>(LIST_SUBSCRIPTION_SQL, [userId]);
  return rows.some((r) => rowIsBillableMotionflowSubscription(r) && rowIsActive(r));
}

/**
 * Infers a `PricingTier` from a normalised product-name token when no catalog
 * price/product id is available. Returns `null` if the token is unrecognised.
 */
function resolveCreatorTierFromNameToken(token: string): PricingTier | null {
  if (
    /\bcreator\s*\+\s*ai\b/i.test(token) ||
    /\bcreator\s+ai\b/i.test(token) ||
    /\+\s*ai\b/i.test(token) ||
    (/\bcreator\b/i.test(token) && /\bai\b/i.test(token))
  ) {
    return "creator_ai";
  }
  if (/\bcreator\b/i.test(token)) return "creator";
  return null;
}

/** Paddle `pro_…` ids for the Creator + AI product (optional; also inferred from product name). */
const CREATOR_AI_PADDLE_PRODUCT_IDS = new Set(
  (process.env.PADDLE_PRODUCT_CREATOR_AI_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

/** Paddle `pri_…` price ids for Creator + AI (optional; use when product name is ambiguous). */
const CREATOR_AI_PADDLE_PRICE_IDS = new Set(
  (process.env.PADDLE_PRICE_CREATOR_AI_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

function rowIsCreatorPlusAi(r: SubRow): boolean {
  const priceId = r.paddle_price_id?.trim();
  if (priceId && CREATOR_AI_PADDLE_PRICE_IDS.has(priceId)) return true;
  const pid = r.paddle_product_id?.trim();
  if (pid && CREATOR_AI_PADDLE_PRODUCT_IDS.has(pid)) return true;
  const raw = r.paddle_product_name?.trim();
  if (!raw) return false;
  const token = normalizePaddleProductNameToken(raw);
  return resolveCreatorTierFromNameToken(token) === "creator_ai";
}

const GENERATION_SUBSCRIPTION_SQL = `SELECT id, author_id, status, subscription_id, plan, ends_at, created_at,
            paddle_product_id, paddle_price_id, paddle_product_name,
            paddle_billing_period_starts_at, paddle_billing_period_ends_at,
            scheduled_change_action, scheduled_change_effective_at,
            scheduled_change_paddle_product_id, scheduled_change_paddle_price_id,
            scheduled_change_paddle_product_name, scheduled_change_plan
     FROM \`${TABLE}\`
     WHERE buyer_id = ?
     ORDER BY id DESC`;

function sortSubscriptionRowsByIdDesc(a: SubRow, b: SubRow): number {
  return (Number(b.id) || 0) - (Number(a.id) || 0);
}

/**
 * Pick quota row: prefer Creator + AI among all active catalog rows (not only the newest row),
 * so a newer cancelled Creator subscription does not override an older active Creator + AI row.
 */
function pickTierRowForGenerations(activeCatalog: SubRow[]): SubRow | null {
  if (activeCatalog.length === 0) return null;
  const sorted = [...activeCatalog].sort(sortSubscriptionRowsByIdDesc);
  const aiRow = sorted.find((r) => rowIsCreatorPlusAi(r));
  if (aiRow) return aiRow;
  return sorted[0] ?? null;
}

/** Billing window from Paddle (see `paddle-server` webhook persistence). */
export interface MotionflowGenerationContext {
  plan: MotionflowGenerationPlan;
  paddleBillingPeriodStartsAt: string | null;
  paddleBillingPeriodEndsAt: string | null;
}

/**
 * Plan tier + current Paddle billing period bounds for generation quotas.
 * The billing row is the newest active catalog row, preferring Creator + AI.
 */
export async function getMotionflowGenerationContext(
  userId: number,
): Promise<MotionflowGenerationContext> {
  const pool = getPool();
  const [rows] = await pool.execute<SubRow[]>(GENERATION_SUBSCRIPTION_SQL, [
    userId,
  ]);

  const activeCatalog = rows.filter(
    (r) => rowIsBillableMotionflowSubscription(r) && rowIsActive(r),
  );
  const tierRow = pickTierRowForGenerations(activeCatalog);

  if (tierRow) {
    return {
      plan: rowIsCreatorPlusAi(tierRow) ? "creator_ai" : "creator",
      paddleBillingPeriodStartsAt: tierRow.paddle_billing_period_starts_at ?? null,
      paddleBillingPeriodEndsAt: tierRow.paddle_billing_period_ends_at ?? null,
    };
  }
  return {
    plan: "none",
    paddleBillingPeriodStartsAt: null,
    paddleBillingPeriodEndsAt: null,
  };
}

/**
 * Which Motionflow catalog plan should apply for AI generation quotas.
 * Creator + AI takes precedence if the user has both rows for some reason.
 */
export async function getMotionflowGenerationPlan(
  userId: number,
): Promise<MotionflowGenerationPlan> {
  const ctx = await getMotionflowGenerationContext(userId);
  return ctx.plan;
}
