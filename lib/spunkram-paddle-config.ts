export type SpunkramLicenseType = "personal" | "commercial";

/** Spunkram storefront author id in the marketplace DB (see `app/(authors)/spunkram/page.tsx`). */
export const SPUNKRAM_AUTHOR_ID = 1691;

export type SpunkramSubscriptionTierId = "free" | "library" | "ai_toolkit";

/**
 * Spunkram subscription prices for the selected Paddle environment.
 * Set in `.env`:
 *   NEXT_PUBLIC_SPUNKRAM_PADDLE_ENVIRONMENT=sandbox
 *   NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EDITOR_MONTHLY=pri_…
 *   NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EDITOR_YEARLY=pri_…
 *   NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EDITOR_PRODUCTION_MONTHLY=pri_…
 *   NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EDITOR_PRODUCTION_YEARLY=pri_…
 *   NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EDITOR_AI_MONTHLY=pri_…
 *   NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EDITOR_AI_YEARLY=pri_…
 *   NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EDITOR_AI_PRODUCTION_MONTHLY=pri_…
 *   NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EDITOR_AI_PRODUCTION_YEARLY=pri_…
 *   NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EXTRA_20=pri_…
 *   NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EXTRA_50=pri_…
 *   NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EXTRA_200=pri_…
 *   NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EXTRA_PRODUCTION_20=pri_…
 *   NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EXTRA_PRODUCTION_50=pri_…
 *   NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EXTRA_PRODUCTION_100=pri_…
 */
export const spunkramPaddleEnvironment =
  process.env.NEXT_PUBLIC_SPUNKRAM_PADDLE_ENVIRONMENT?.toLowerCase() === "production"
    ? "production" : "sandbox";
const isSpunkramPaddleProduction = spunkramPaddleEnvironment === "production";

export const SPUNKRAM_LIBRARY_SUBSCRIPTION_PRICE_IDS = {
  monthly:
    (isSpunkramPaddleProduction
      ? process.env.NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EDITOR_PRODUCTION_MONTHLY
      : process.env.NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EDITOR_MONTHLY) ?? "",
  yearly:
    (isSpunkramPaddleProduction
      ? process.env.NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EDITOR_PRODUCTION_YEARLY
      : process.env.NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EDITOR_YEARLY) ?? "",
} as const;

export const SPUNKRAM_AI_TOOLKIT_SUBSCRIPTION_PRICE_IDS = {
  monthly:
    (isSpunkramPaddleProduction
      ? process.env.NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EDITOR_AI_PRODUCTION_MONTHLY
      : process.env.NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EDITOR_AI_MONTHLY) ?? "",
  yearly:
    (isSpunkramPaddleProduction
      ? process.env.NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EDITOR_AI_PRODUCTION_YEARLY
      : process.env.NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EDITOR_AI_YEARLY) ?? "",
} as const;

function envPri(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v?.startsWith("pri_") ? v : undefined;
}

const sandboxExtraPacks = [
  { count: 20, priceId: envPri(process.env.NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EXTRA_20) },
  { count: 50, priceId: envPri(process.env.NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EXTRA_50) },
  { count: 200, priceId: envPri(process.env.NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EXTRA_200) },
];
const productionExtraPacks = [
  { count: 20, priceId: envPri(process.env.NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EXTRA_PRODUCTION_20) },
  { count: 50, priceId: envPri(process.env.NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EXTRA_PRODUCTION_50) },
  { count: 100, priceId: envPri(process.env.NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EXTRA_PRODUCTION_100) },
];

export const SPUNKRAM_EXTRA_GEN_PACKS: readonly {
  count: number;
  priceId: string | undefined;
}[] = isSpunkramPaddleProduction ? productionExtraPacks : sandboxExtraPacks;

/** One-time Additional Credits prices on the Spunkram Paddle account. */
export function getSpunkramExtraGenPacks() {
  return SPUNKRAM_EXTRA_GEN_PACKS;
}

export function isSpunkramExtraGenerationsPriceId(
  priceId: string | null | undefined,
): boolean {
  return spunkramExtraPackCountForPriceId(priceId) !== null;
}

export function spunkramExtraPackCountForPriceId(
  priceId: string | null | undefined,
): number | null {
  if (!priceId?.startsWith("pri_")) return null;
  return [...productionExtraPacks, ...sandboxExtraPacks]
    .find((pack) => pack.priceId === priceId)?.count ?? null;
}

export const SPUNKRAM_SUBSCRIPTION_PRICE_IDS: Record<
  SpunkramSubscriptionTierId,
  { monthly: string; yearly: string }
> = {
  free: { monthly: "", yearly: "" },
  library: SPUNKRAM_LIBRARY_SUBSCRIPTION_PRICE_IDS,
  ai_toolkit: SPUNKRAM_AI_TOOLKIT_SUBSCRIPTION_PRICE_IDS,
};

export type SpunkramPaddleEnvironment = "sandbox" | "production";

export function listSpunkramSubscriptionPriceIds(): string[] {
  return [
    SPUNKRAM_LIBRARY_SUBSCRIPTION_PRICE_IDS.monthly,
    SPUNKRAM_LIBRARY_SUBSCRIPTION_PRICE_IDS.yearly,
    SPUNKRAM_AI_TOOLKIT_SUBSCRIPTION_PRICE_IDS.monthly,
    SPUNKRAM_AI_TOOLKIT_SUBSCRIPTION_PRICE_IDS.yearly,
  ].filter((id) => id.startsWith("pri_"));
}

export function isSpunkramAiToolkitPriceId(priceId: string | null | undefined): boolean {
  if (!priceId?.startsWith("pri_")) return false;
  const ids = [
    SPUNKRAM_AI_TOOLKIT_SUBSCRIPTION_PRICE_IDS.monthly,
    SPUNKRAM_AI_TOOLKIT_SUBSCRIPTION_PRICE_IDS.yearly,
  ].filter((id) => id.startsWith("pri_"));
  return ids.includes(priceId);
}

export function isSpunkramLibraryPriceId(priceId: string | null | undefined): boolean {
  if (!priceId?.startsWith("pri_")) return false;
  const ids = [
    SPUNKRAM_LIBRARY_SUBSCRIPTION_PRICE_IDS.monthly,
    SPUNKRAM_LIBRARY_SUBSCRIPTION_PRICE_IDS.yearly,
  ].filter((id) => id.startsWith("pri_"));
  return ids.includes(priceId);
}

/**
 * Map a Spunkram author subscription row → tier id.
 * Editor = `library`, Editor AI = `ai_toolkit`.
 */
export function resolveSpunkramSubscriptionTierId(opts: {
  priceId?: string | null;
  plan?: string | null;
  productName?: string | null;
}): SpunkramSubscriptionTierId | null {
  const priceId = opts.priceId?.trim() || null;
  if (isSpunkramAiToolkitPriceId(priceId)) return "ai_toolkit";
  if (isSpunkramLibraryPriceId(priceId)) return "library";

  const blob = `${opts.plan || ""} ${opts.productName || ""}`.toLowerCase();
  if (
    blob.includes("ai_toolkit") ||
    blob.includes("ai toolkit") ||
    /editor\s*ai/.test(blob) ||
    blob.includes("editor+ai")
  ) {
    return "ai_toolkit";
  }
  if (
    blob.includes("library") ||
    /(^|[^a-z])editor([^a-z]|$)/.test(blob) ||
    blob.includes("spunkram")
  ) {
    return "library";
  }
  return null;
}

export function isSpunkramSubscriptionPriceId(priceId: string | null | undefined): boolean {
  if (!priceId?.startsWith("pri_")) return false;
  return listSpunkramSubscriptionPriceIds().includes(priceId);
}

export const SPUNKRAM_LICENSE_OPTIONS: Array<{
  value: SpunkramLicenseType;
  label: string;
  multiplier: number;
}> = [
  { value: "personal", label: "Personal License", multiplier: 1 },
  { value: "commercial", label: "Commercial License", multiplier: 3 },
];

function normalizeKey(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function flattenStringValues(
  value: unknown,
  path: string[],
  out: Map<string, string>,
): void {
  if (typeof value === "string") {
    const v = value.trim();
    if (!v) return;
    out.set(normalizeKey(path.join(".")), v);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, idx) => flattenStringValues(entry, [...path, String(idx)], out));
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    flattenStringValues(v, [...path, k], out);
  }
}

function pickPriceId(
  flattened: Map<string, string>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const hit = flattened.get(normalizeKey(key));
    if (hit?.startsWith("pri_")) return hit;
  }
  return null;
}

export function extractSpunkramPriceIdsFromJsonArgs(
  rawJsonArgs: string | null | undefined,
): { personal: string | null; commercial: string | null } {
  if (!rawJsonArgs) return { personal: null, commercial: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJsonArgs);
  } catch {
    return { personal: null, commercial: null };
  }
  if (!parsed || typeof parsed !== "object") return { personal: null, commercial: null };

  // Canonical format from marketplace:
  // { "paddle_price_ids": ["pri_personal", "pri_commercial"] }
  const parsedObject = parsed as Record<string, unknown>;
  const fromArray = parsedObject.paddle_price_ids;
  if (Array.isArray(fromArray)) {
    const personalRaw = typeof fromArray[0] === "string" ? fromArray[0].trim() : "";
    const commercialRaw = typeof fromArray[1] === "string" ? fromArray[1].trim() : "";
    const personal = personalRaw.startsWith("pri_") ? personalRaw : null;
    const commercial = commercialRaw.startsWith("pri_") ? commercialRaw : null;
    if (personal || commercial) {
      return { personal, commercial };
    }
  }

  const flattened = new Map<string, string>();
  flattenStringValues(parsed, [], flattened);

  const personal = pickPriceId(flattened, [
    "pricings.personal.price_id",
    "pricings.personal.priceId",
    "pricings.personal.paddle_price_id",
    "pricings.personal.paddlePriceId",
    "pricing.personal.price_id",
    "pricing.personal.priceId",
    "personal.price_id",
    "personal.priceId",
    "personal_paddle_price_id",
    "personalPriceId",
    "price_id_personal",
  ]);

  const commercial = pickPriceId(flattened, [
    "pricings.commercial.price_id",
    "pricings.commercial.priceId",
    "pricings.commercial.paddle_price_id",
    "pricings.commercial.paddlePriceId",
    "pricing.commercial.price_id",
    "pricing.commercial.priceId",
    "commercial.price_id",
    "commercial.priceId",
    "commercial_paddle_price_id",
    "commercialPriceId",
    "price_id_commercial",
  ]);

  // If only a generic `price_id` exists in json_args, treat it as personal.
  const fallbackGeneric = pickPriceId(flattened, ["price_id", "priceId", "paddle_price_id", "paddlePriceId"]);

  return {
    personal: personal ?? fallbackGeneric,
    commercial,
  };
}
