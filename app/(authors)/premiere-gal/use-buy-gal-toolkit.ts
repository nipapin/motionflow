"use client";

import { toast } from "sonner";
import { usePaddle } from "@/lib/paddle";
import { useAuth } from "@/components/auth-provider";
import { PREMIERE_GAL_PRICE_IDS, type PremiereGalPlanId } from "@/lib/premiere-gal-paddle-config";
import { usePageSets } from "./page-sets-context";

/** Port of the inline `buyItemPaymentGate(plan)` from `resources/views/premieregal/main.blade.php`. */
export function useBuyGalToolkit() {
  const { paddle, ready } = usePaddle();
  const { user, openSignIn } = useAuth();
  const pageSets = usePageSets();

  return (plan: PremiereGalPlanId) => {
    if (!user) {
      openSignIn("signin");
      return;
    }
    const priceId = PREMIERE_GAL_PRICE_IDS[plan];
    if (!priceId?.startsWith("pri_")) {
      console.error(`[premiere-gal] Missing price id for plan=${plan}`);
      toast.error("Checkout is not configured for this plan.");
      return;
    }
    if (!paddle) {
      toast.error(ready ? "Checkout is not ready yet. Please try again." : "Checkout is still loading…");
      return;
    }

    const discountId = plan === "monthly" ? undefined : (pageSets.discount_id ?? undefined);

    try {
      // Paddle customData values must be strings (Laravel Blade sent buyer_id as a string).
      paddle.Checkout.open({
        settings: {
          displayMode: "overlay",
          theme: "light",
          allowLogout: false,
        },
        items: [{ priceId, quantity: 1 }],
        customer: { email: user.email },
        customData: {
          buyer_id: String(user.id),
          plan,
        },
        ...(discountId ? { discountId } : {}),
      });
    } catch (err) {
      console.error("[premiere-gal] paddle checkout open failed:", err);
      toast.error("Could not open checkout. Please try again.");
    }
  };
}
