import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import type { CepClientConfig } from "@/lib/cep-client-registry";
import { getMarketItemsByAuthorId } from "@/lib/market-items";
import {
  motionflowItemDownloadUrl,
  motionflowItemPageUrl,
  motionflowMainSiteUrl,
  motionflowSiteOrigin,
} from "@/lib/motionflow-urls";
import { productThumbnailUrl } from "@/lib/product-ui";
import type { Product } from "@/lib/product-types";
import { getPurchasesForUser, userOwnsItem } from "@/lib/purchases";
import {
  resolveSpunkramSubscriptionTierId,
  type SpunkramSubscriptionTierId,
} from "@/lib/spunkram-paddle-config";

const SUB_TABLE = "subscription_systems";

export type CepAccessTier = "free" | "purchased" | "subscribed";

export type CepAuthorSubscription = {
  active: boolean;
  plan: string | null;
  status: string | null;
  renews_at: string | null;
  /** `library` = Editor, `ai_toolkit` = Editor AI */
  tierId: SpunkramSubscriptionTierId | null;
};

type SubRow = RowDataPacket & {
  id: number;
  author_id: number | null;
  status: number;
  plan: string | null;
  ends_at: string | null;
  paddle_product_name: string | null;
  paddle_price_id: string | null;
};

function endsAtStillValid(endsAt: string | null): boolean {
  if (!endsAt) return true;
  return new Date(endsAt) > new Date();
}

function rowIsActive(r: SubRow): boolean {
  if (r.ends_at && r.status === -1) {
    return endsAtStillValid(r.ends_at);
  }
  if (r.status === 1) return endsAtStillValid(r.ends_at);
  return false;
}

function toIsoDate(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s.includes("T") ? s : `${s.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Active subscription for a marketplace author (e.g. Spunkram 1691).
 * Ignores platform Motionflow Creator / Creator + AI (author_id IS NULL).
 */
export async function getActiveAuthorSubscription(
  userId: number,
  authorId: number,
): Promise<CepAuthorSubscription> {
  const pool = getPool();
  const [rows] = await pool.execute<SubRow[]>(
    `SELECT id, author_id, status, plan, ends_at, paddle_product_name, paddle_price_id
     FROM \`${SUB_TABLE}\`
     WHERE buyer_id = ? AND author_id = ?
     ORDER BY id DESC`,
    [userId, authorId],
  );
  const active = rows.find((r) => rowIsActive(r));
  if (!active) {
    return {
      active: false,
      plan: null,
      status: "none",
      renews_at: null,
      tierId: null,
    };
  }
  const cancelled = active.status === -1;
  const planLabel =
    active.paddle_product_name?.trim() ||
    active.plan?.trim() ||
    "Spunkram Library";
  const tierId =
    resolveSpunkramSubscriptionTierId({
      priceId: active.paddle_price_id,
      plan: active.plan,
      productName: active.paddle_product_name,
    }) ?? "ai_toolkit";
  return {
    active: true,
    plan: planLabel,
    status: cancelled ? "cancelled" : "active",
    renews_at: toIsoDate(active.ends_at),
    tierId,
  };
}

/** Monthly AI generation quota for Spunkram CEP by subscription tier. */
export function cepAiGenerationsLimit(
  cfg: CepClientConfig,
  subscription: Pick<CepAuthorSubscription, "active" | "tierId">,
): number {
  if (!subscription.active) return cfg.freeGenerationsLimit;
  if (subscription.tierId === "library") return cfg.editorGenerationsLimit;
  return cfg.editorAiGenerationsLimit;
}

export type CepPurchaseDto = {
  id: string;
  name?: string;
  product_type?: string;
  /** Host app for this pack; null = other hosts (e.g. DaVinci) — hide in AE/PR CEP. */
  primary_type: "AE" | "PR" | null;
};

export async function resolveCepTier(
  userId: number,
  cfg: CepClientConfig,
  opts?: { host?: "AE" | "PR" },
): Promise<{
  tier: CepAccessTier;
  subscription: CepAuthorSubscription;
  purchaseCount: number;
  purchases: CepPurchaseDto[];
}> {
  const [subscription, allPurchases] = await Promise.all([
    getActiveAuthorSubscription(userId, cfg.authorId),
    getPurchasesForUser(userId),
  ]);

  const authorPurchases = allPurchases.filter(
    (p) => p.product?.author_id === cfg.authorId,
  );

  const seenItemIds = new Set<number>();
  const purchases: CepPurchaseDto[] = [];
  for (const p of authorPurchases) {
    if (seenItemIds.has(p.itemId)) continue;
    seenItemIds.add(p.itemId);
    const primary_type = p.product ? productHostType(p.product) : null;
    if (opts?.host && primary_type !== opts.host) continue;
    purchases.push({
      id: `purchase_${p.id}`,
      name: p.product?.name || `Item ${p.itemId}`,
      product_type: "pack",
      primary_type,
    });
  }

  let tier: CepAccessTier = "free";
  if (subscription.active) tier = "subscribed";
  else if (authorPurchases.length > 0) tier = "purchased";

  return {
    tier,
    subscription,
    purchaseCount: authorPurchases.length,
    purchases,
  };
}

export function cepEntitlementsForTier(
  tier: CepAccessTier,
  cfg: CepClientConfig,
  subscription?: Pick<CepAuthorSubscription, "active" | "tierId">,
): { free_pack_slots: number; ai_generations_limit: number } {
  return {
    free_pack_slots: cfg.freePackSlots,
    ai_generations_limit: cepAiGenerationsLimit(
      cfg,
      subscription ?? {
        active: tier === "subscribed",
        tierId: tier === "subscribed" ? "ai_toolkit" : null,
      },
    ),
  };
}

export function cepSubscribeUrl(cfg: CepClientConfig): string {
  return motionflowMainSiteUrl(cfg.pricingPath);
}

export function cepManageSubscriptionUrl(cfg: CepClientConfig): string {
  return motionflowMainSiteUrl(cfg.manageSubscriptionPath);
}

/** Map marketplace category / name → CEP host type (AE/PR only). */
export function productHostType(product: Product): "AE" | "PR" | null {
  const slug = (product.index_category_slug || "").toLowerCase();
  if (slug === "after-effects" || slug === "ae" || slug.includes("after-effect")) {
    return "AE";
  }
  if (slug === "premiere-pro" || slug === "premiere" || slug === "pr") {
    return "PR";
  }
  const name = (product.name || "").toLowerCase();
  if (name.includes("after effects") || name.includes("after-effects")) {
    return "AE";
  }
  if (name.includes("premiere")) {
    return "PR";
  }
  return null;
}

function extractYoutubeId(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  if (/^[\w-]{6,}$/.test(s) && !s.includes("/")) return s;
  try {
    const u = new URL(s.startsWith("http") ? s : `https://${s}`);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.replace(/^\//, "") || undefined;
    }
    return u.searchParams.get("v") || undefined;
  } catch {
    return undefined;
  }
}

export type CepMarketAction = "install" | "buy" | "get_free";

export type CepMarketPackageDto = {
  id: string;
  name: string;
  pack_name: string;
  author: string;
  version?: string;
  primary_type: "AE" | "PR";
  image_url: string;
  custom_price?: number;
  video_id?: string;
  owned: boolean;
  covered_by_subscription: boolean;
  action: CepMarketAction;
  install_url: string | null;
  buy_url: string | null;
};

function packNameSlug(product: Product): string {
  return product.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || `pack-${product.id}`;
}

function effectivePrice(product: Product): number {
  if (
    product.discount_price != null &&
    Number.isFinite(product.discount_price) &&
    product.discount_price >= 0
  ) {
    return Number(product.discount_price);
  }
  return Number(product.price) || 0;
}

/**
 * Build market packages for a host. Entitlement flags are server-owned.
 */
export async function buildCepMarketPackages(opts: {
  userId: number;
  cfg: CepClientConfig;
  host: "AE" | "PR";
}): Promise<{
  subscription_active: boolean;
  subscribe_url: string;
  Packages: CepMarketPackageDto[];
}> {
  const { userId, cfg, host } = opts;
  const [subscription, products, purchases] = await Promise.all([
    getActiveAuthorSubscription(userId, cfg.authorId),
    getMarketItemsByAuthorId(cfg.authorId, 500),
    getPurchasesForUser(userId),
  ]);

  const ownedIds = new Set(
    purchases
      .filter((p) => p.product?.author_id === cfg.authorId)
      .map((p) => p.itemId),
  );

  const subscriptionActive = subscription.active;
  const packages: CepMarketPackageDto[] = [];

  for (const product of products) {
    const primary = productHostType(product);
    if (primary !== host) continue;

    const owned = ownedIds.has(product.id);
    const price = effectivePrice(product);
    const isFreePrice = price <= 0;
    const covered = subscriptionActive;

    let action: CepMarketAction;
    if (owned || subscriptionActive) {
      action = "install";
    } else if (isFreePrice) {
      action = "get_free";
    } else {
      action = "buy";
    }

    const installUrl =
      action === "install" || action === "get_free"
        ? motionflowItemDownloadUrl(product, product.id, product.name)
        : null;

    const buyUrl =
      action === "buy"
        ? motionflowItemPageUrl(product, product.id, product.name)
        : null;

    packages.push({
      id: String(product.id),
      name: product.name,
      pack_name: packNameSlug(product),
      author: cfg.extensionName,
      version: undefined,
      primary_type: primary,
      image_url: productThumbnailUrl(product) || `${motionflowSiteOrigin()}/assets/spunkram.svg`,
      custom_price: isFreePrice ? 0 : price,
      video_id: extractYoutubeId(product.youtube_preview),
      owned,
      covered_by_subscription: covered || isFreePrice,
      action,
      install_url: installUrl,
      buy_url: buyUrl,
    });
  }

  return {
    subscription_active: subscriptionActive,
    subscribe_url: cepSubscribeUrl(cfg),
    Packages: packages,
  };
}

export async function userCanDownloadCepPack(opts: {
  userId: number;
  packId: number;
  cfg: CepClientConfig;
}): Promise<{ ok: true } | { ok: false; error: "NOT_OWNED" | "SUBSCRIPTION_REQUIRED" | "NOT_FOUND" }> {
  const { userId, packId, cfg } = opts;
  const products = await getMarketItemsByAuthorId(cfg.authorId, 500);
  const product = products.find((p) => p.id === packId);
  if (!product) return { ok: false, error: "NOT_FOUND" };

  const owned = await userOwnsItem(userId, packId);
  if (owned) return { ok: true };

  const sub = await getActiveAuthorSubscription(userId, cfg.authorId);
  if (sub.active) return { ok: true };

  if (effectivePrice(product) <= 0) return { ok: true };

  return { ok: false, error: "NOT_OWNED" };
}
