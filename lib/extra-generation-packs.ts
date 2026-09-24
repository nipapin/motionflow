import { isSpunkramExtraGenerationsPriceId } from "@/lib/spunkram-paddle-config";

/**
 * Paddle catalog price IDs for one-time extra generation packs (`pri_…`).
 *
 * Set in `.env` (exposed to the browser for Paddle Checkout):
 *   NEXT_PUBLIC_PADDLE_PRICE_EXTRA_AI_GEN_20
 *   NEXT_PUBLIC_PADDLE_PRICE_EXTRA_AI_GEN_50
 *   NEXT_PUBLIC_PADDLE_PRICE_EXTRA_AI_GEN_200
 *
 * Labels in the buy dialog come from the Paddle API (`GET /api/paddle/extra-generation-prices`, server `PADDLE_API_KEY`).
 * Without price ids, Continue stays in the dialog and checkout is disabled.
 */

function envPri(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v?.startsWith("pri_") ? v : undefined;
}

export function getExtraGenPacks(): readonly { count: number; priceId: string | undefined }[] {
  return [
    { count: 20, priceId: envPri(process.env.NEXT_PUBLIC_PADDLE_PRICE_EXTRA_AI_GEN_20) },
    { count: 50, priceId: envPri(process.env.NEXT_PUBLIC_PADDLE_PRICE_EXTRA_AI_GEN_50) },
    { count: 200, priceId: envPri(process.env.NEXT_PUBLIC_PADDLE_PRICE_EXTRA_AI_GEN_200) },
  ];
}

export const EXTRA_GEN_PACKS: readonly { count: number; priceId: string | undefined }[] =
  getExtraGenPacks();

export function packsWithConfiguredCheckout(): { count: number; priceId: string }[] {
  return getExtraGenPacks().filter((p): p is { count: number; priceId: string } =>
    Boolean(p.priceId),
  );
}

/** One-time extra generation pack rows in `subscription_systems` (legacy) use these price ids. */
export function isExtraGenerationsPackPriceId(priceId: string | null | undefined): boolean {
  if (!priceId) return false;
  return (
    getExtraGenPacks().some((p) => p.priceId === priceId) ||
    isSpunkramExtraGenerationsPriceId(priceId)
  );
}
