"use client";

import { usePaddle } from "@/lib/paddle";
import { useAuth } from "@/components/auth-provider";
import { PREMIERE_GAL_PRICE_IDS, type PremiereGalPlanId } from "@/lib/premiere-gal-paddle-config";
import { usePageSets } from "./page-sets-context";

/** Port of the inline `buyItemPaymentGate(plan)` from `resources/views/premieregal/main.blade.php`. */
export function useBuyGalToolkit() {
  const { paddle } = usePaddle();
  const { user, openSignIn } = useAuth();
  const pageSets = usePageSets();

  return (plan: PremiereGalPlanId) => {
    if (!user) {
      openSignIn("signin");
      return;
    }
    const priceId = PREMIERE_GAL_PRICE_IDS[plan];
    if (!priceId || !paddle) return;

    paddle.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      customer: { email: user.email },
      customData: {
        buyer_id: user.id,
        plan,
      },
      discountId: plan === "monthly" ? undefined : (pageSets.discount_id ?? undefined),
    });
  };
}
