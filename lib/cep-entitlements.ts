import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import type { CepClientConfig } from "@/lib/cep-client-registry";
import {
  motionflowMainSiteUrl,
  motionflowSiteOrigin,
} from "@/lib/motionflow-urls";
import type { Product } from "@/lib/product-types";
import { getOwnedItemIdSet, getPurchasesForUser, userOwnsItem } from "@/lib/purchases";
import {
  getPackagesAuthorById,
} from "@/lib/packages-admin";
import {
  getPackagesProjectById,
  listVisiblePackagesProjects,
  type PackagesProjectDto,
} from "@/lib/packages-projects";
import { parseMarketplaceItemIdInput } from "@/lib/packages-marketplace-id";
import { getMarketItemsByIds } from "@/lib/market-items";
import { motionflowItemPageUrl } from "@/lib/motionflow-urls";
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
  /** @deprecated CEP packs no longer expose video previews. */
  video_id?: string;
  owned: boolean;
  covered_by_subscription: boolean;
  action: CepMarketAction;
  install_url: string | null;
  buy_url: string | null;
  details_url?: string | null;
  min_extension_version?: string | null;
  min_host_version?: string | null;
};

function packNameSlug(name: string, id: number): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || `pack-${id}`;
}

function cepPackInstallUrl(packId: number): string {
  return `${motionflowSiteOrigin()}/api/cep/market/download?pack_id=${packId}`;
}

function projectImageUrl(project: PackagesProjectDto): string {
  if (project.previewUrl) return project.previewUrl;
  return `${motionflowSiteOrigin()}/assets/spunkram.svg`;
}

/** True for bare `/item/1138` (Laravel category 404) or plural Spunkram typos. */
function isBrokenItemPath(url: string | null | undefined): boolean {
  if (!url?.trim()) return true;
  try {
    const path = new URL(url, motionflowSiteOrigin()).pathname;
    return (
      /^\/item\/\d+\/?$/.test(path) || /^\/spunkram\/items?\/\d+\/?$/.test(path)
    );
  } catch {
    return true;
  }
}

async function resolveProjectDetailsUrl(
  project: PackagesProjectDto,
): Promise<string | null> {
  const linkedId = project.marketplace_item_id;
  if (linkedId != null && isBrokenItemPath(project.details_url)) {
    const products = await getMarketItemsByIds([linkedId]);
    const product = products[0];
    if (product) {
      return motionflowItemPageUrl(product, linkedId, product.name);
    }
    // Spunkram Next storefront works with id-only paths.
    return `${motionflowSiteOrigin()}/spunkram/item/${linkedId}`;
  }
  if (project.details_url) return project.details_url;
  if (linkedId != null) {
    const parsed = parseMarketplaceItemIdInput(String(linkedId));
    if (parsed != null) {
      return `${motionflowSiteOrigin()}/spunkram/item/${parsed}`;
    }
  }
  return null;
}

/**
 * Build market packages for a host from `packages_projects` (not marketplace_items).
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
  const [subscription, projects] = await Promise.all([
    getActiveAuthorSubscription(userId, cfg.authorId),
    listVisiblePackagesProjects(cfg.authorId, host),
  ]);

  const subscriptionActive = subscription.active;
  const ownershipLookupIds = projects.flatMap((p) => {
    const ids: number[] = [];
    if (p.marketplace_item_id != null) ids.push(p.marketplace_item_id);
    // Legacy: some early packs may have used project id as sold_items.item_id.
    ids.push(p.id);
    return ids;
  });
  const ownedIds = await getOwnedItemIdSet(userId, ownershipLookupIds);
  const detailsUrls = await Promise.all(
    projects.map((project) => resolveProjectDetailsUrl(project)),
  );
  const packages: CepMarketPackageDto[] = [];

  for (let i = 0; i < projects.length; i++) {
    const project = projects[i]!;
    const detailsUrl = detailsUrls[i] ?? null;
    const price = Number(project.price) || 0;
    const isFreePrice = price <= 0;
    const owned =
      (project.marketplace_item_id != null &&
        ownedIds.has(project.marketplace_item_id)) ||
      ownedIds.has(project.id);

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
        ? cepPackInstallUrl(project.id)
        : null;

    const buyUrl =
      action === "buy" ? detailsUrl || cepSubscribeUrl(cfg) : null;

    packages.push({
      id: String(project.id),
      name: project.name,
      pack_name: packNameSlug(project.name, project.id),
      author: cfg.extensionName,
      version: project.version || undefined,
      primary_type: project.host,
      image_url: projectImageUrl(project),
      custom_price: isFreePrice ? 0 : price,
      owned,
      covered_by_subscription: subscriptionActive,
      action,
      install_url: installUrl,
      buy_url: buyUrl,
      details_url: detailsUrl,
      min_extension_version: project.min_extension_version,
      min_host_version: project.min_host_version,
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
  const project = await getPackagesProjectById(packId);
  if (!project || project.author_id !== cfg.authorId || !project.visible) {
    return { ok: false, error: "NOT_FOUND" };
  }

  const sub = await getActiveAuthorSubscription(userId, cfg.authorId);
  if (sub.active) return { ok: true };

  if ((Number(project.price) || 0) <= 0) return { ok: true };

  if (
    project.marketplace_item_id != null &&
    (await userOwnsItem(userId, project.marketplace_item_id))
  ) {
    return { ok: true };
  }

  // Legacy fallback: early packs may have used project id as sold_items.item_id.
  if (await userOwnsItem(userId, packId)) return { ok: true };

  return { ok: false, error: "NOT_OWNED" };
}

/** Resolve author + project for download redirect (after entitlement gate). */
export async function resolveCepPackDownload(opts: {
  packId: number;
  cfg: CepClientConfig;
}): Promise<{
  project: PackagesProjectDto;
  author: NonNullable<Awaited<ReturnType<typeof getPackagesAuthorById>>>;
} | null> {
  const project = await getPackagesProjectById(opts.packId);
  if (!project || project.author_id !== opts.cfg.authorId || !project.visible) {
    return null;
  }
  const author = await getPackagesAuthorById(project.author_id);
  if (!author) return null;
  return { project, author };
}
