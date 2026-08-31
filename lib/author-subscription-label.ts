import {
  PREMIERE_GAL_AUTHOR_ID,
} from "@/lib/premiere-gal-paddle-config";
import {
  SPUNKRAM_AUTHOR_ID,
  type SpunkramSubscriptionTierId,
} from "@/lib/spunkram-paddle-config";

/** Human label for admin Users table badges. */
export function formatAuthorSubscriptionLabel(opts: {
  authorId: number;
  active: boolean;
  plan: string | null;
  productName: string | null;
  priceId: string | null;
  tierId: SpunkramSubscriptionTierId | null;
}): string | null {
  if (!opts.active) return null;
  if (opts.authorId === SPUNKRAM_AUTHOR_ID) {
    if (opts.tierId === "ai_toolkit") return "Editor AI";
    if (opts.tierId === "library") return "Editor";
    const blob = `${opts.plan || ""} ${opts.productName || ""}`.toLowerCase();
    if (/editor\s*ai|ai_toolkit|ai toolkit/.test(blob)) return "Editor AI";
    return "Editor";
  }
  if (opts.authorId === PREMIERE_GAL_AUTHOR_ID) {
    const plan = (opts.plan || "").toLowerCase();
    if (plan === "lifetime") return "Lifetime";
    if (plan === "annual" || plan === "yearly") return "Yearly";
    if (plan === "monthly") return "Monthly";
    return opts.productName?.trim() || "Subscribed";
  }
  return opts.productName?.trim() || opts.plan?.trim() || "Subscribed";
}
