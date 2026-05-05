export type SpunkramLicenseType = "personal" | "commercial";

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
