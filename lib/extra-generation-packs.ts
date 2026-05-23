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
export const EXTRA_GEN_PACKS: readonly { count: number; priceId: string | undefined }[] =
  [
    { count: 20, priceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_EXTRA_AI_GEN_20 },
    { count: 50, priceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_EXTRA_AI_GEN_50 },
    { count: 200, priceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_EXTRA_AI_GEN_200 },
  ];

export function packsWithConfiguredCheckout(): { count: number; priceId: string }[] {
  return EXTRA_GEN_PACKS.filter((p): p is { count: number; priceId: string } =>
    Boolean(p.priceId),
  );
}

/** One-time extra generation pack rows in `subscription_systems` (legacy) use these price ids. */
export function isExtraGenerationsPackPriceId(priceId: string | null | undefined): boolean {
  if (!priceId) return false;
  return EXTRA_GEN_PACKS.some((p) => p.priceId === priceId);
}
