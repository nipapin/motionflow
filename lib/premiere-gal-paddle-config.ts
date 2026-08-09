export type PremiereGalPlanId = "monthly" | "yearly" | "lifetime";

/** Premiere Gal (Gal Toolkit MAX) author id in the marketplace DB — see config/subs_control.php in the Laravel app. */
export const PREMIERE_GAL_AUTHOR_ID = 4141;

/**
 * Paddle price IDs for Gal Toolkit MAX (`pro_01km5h8ctcd91ygwktzzpvwt63`).
 * Must match live Catalog → Prices (old `pri_01kjw…` ids 404 and cause checkout 400).
 */
export const PREMIERE_GAL_PRICE_IDS: Record<PremiereGalPlanId, string> = {
  monthly: "pri_01km5hnjhxxbmqayav9et25xt0",
  yearly: "pri_01km5hqygery4ewnnh9kvjcnss",
  lifetime: "pri_01km5ht3bbx00pa6yssfhf6td3",
};
