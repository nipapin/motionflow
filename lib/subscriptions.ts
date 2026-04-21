import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import {
  applyMotionflowProductTitleTemplate,
  normalizePaddleProductNameToken,
} from "@/lib/paddle-product-label";

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
  author_id: number | null;
  status: number;
  subscription_id: string;
  plan: string | null;
  ends_at: string | null;
  created_at: string | null;
  paddle_product_id: string | null;
  paddle_price_id: string | null;
  paddle_product_name: string | null;
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
