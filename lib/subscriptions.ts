import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import type { MotionflowGenerationPlan } from "@/lib/generation-plan";
import {
  applyMotionflowProductTitleTemplate,
  normalizePaddleProductNameToken,
} from "@/lib/paddle-product-label";

export type { MotionflowGenerationPlan } from "@/lib/generation-plan";

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

function formatDateDMY(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

const TABLE = "subscription_systems";

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
    if (new Date(r.ends_at) > new Date()) {
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
  const [rows] = await pool.execute<SubRow[]>(
    `SELECT author_id, status, subscription_id, plan, ends_at, created_at,
            paddle_product_id, paddle_price_id, paddle_product_name
     FROM \`${TABLE}\`
     WHERE buyer_id = ?
     ORDER BY id DESC`,
    [userId],
  );

  return rows.map((r) => {
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
  const [rows] = await pool.execute<SubRow[]>(
    `SELECT author_id, status, subscription_id, plan, ends_at, created_at,
            paddle_product_id, paddle_price_id, paddle_product_name
     FROM \`${TABLE}\`
     WHERE buyer_id = ?
     ORDER BY id DESC`,
    [userId],
  );
  return rows.some((r) => rowIsMotionflowCatalogSubscription(r) && rowIsActive(r));
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
  if (
    /\bcreator\s*\+\s*ai\b/i.test(token) ||
    /\bcreator\s+ai\b/i.test(token) ||
    /\+\s*ai\b/i.test(token)
  ) {
    return true;
  }
  // e.g. "Creator AI", "AI Creator Pack" — require both tokens for Motionflow catalog rows
  if (/\bcreator\b/i.test(token) && /\bai\b/i.test(token)) return true;
  return false;
}

const GENERATION_SUBSCRIPTION_SQL = `SELECT id, author_id, status, subscription_id, plan, ends_at, created_at,
            paddle_product_id, paddle_price_id, paddle_product_name,
            paddle_billing_period_starts_at, paddle_billing_period_ends_at
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
    (r) => rowIsMotionflowCatalogSubscription(r) && rowIsActive(r),
  );
  const tierRow = pickTierRowForGenerations(activeCatalog);

  if (tierRow && rowIsCreatorPlusAi(tierRow)) {
    return {
      plan: "creator_ai",
      paddleBillingPeriodStartsAt:
        tierRow.paddle_billing_period_starts_at ?? null,
      paddleBillingPeriodEndsAt: tierRow.paddle_billing_period_ends_at ?? null,
    };
  }
  if (tierRow) {
    return {
      plan: "creator",
      paddleBillingPeriodStartsAt:
        tierRow.paddle_billing_period_starts_at ?? null,
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
