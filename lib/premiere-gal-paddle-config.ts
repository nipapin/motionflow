export type PremiereGalPlanId = "monthly" | "yearly" | "lifetime";

/** Premiere Gal (Gal Toolkit MAX) author id in the marketplace DB — see config/subs_control.php in the Laravel app. */
export const PREMIERE_GAL_AUTHOR_ID = 4141;

/** Paddle price IDs for the Gal Toolkit MAX checkout, mirrored from `config/subs_control.php` (author_id 4141). */
export const PREMIERE_GAL_PRICE_IDS: Record<PremiereGalPlanId, string> = {
  monthly: "pri_01kjws089qpw4hdx1fba8bfyzp",
  yearly: "pri_01kjws0vmfg6vx535qagc1w0yg",
  lifetime: "pri_01kjwrz3rtqrc6qw1g18ardan3",
};
