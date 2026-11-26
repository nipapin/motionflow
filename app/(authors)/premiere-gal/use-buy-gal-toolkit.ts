"use client";

import { toast } from "sonner";
import { useRef, useState } from "react";
import { usePaddle } from "@/lib/paddle";
import { useAuth } from "@/components/auth-provider";
import type { PremiereGalOffer } from "@/lib/premiere-gal-black-friday";
import { PREMIERE_GAL_PRICE_IDS, type PremiereGalPlanId } from "@/lib/premiere-gal-paddle-config";

/** Port of the inline `buyItemPaymentGate(plan)` from `resources/views/premieregal/main.blade.php`. */
export function useBuyGalToolkit() {
  const { paddle, ready } = usePaddle();
  const { user, openSignIn } = useAuth();
  const [openingCheckout, setOpeningCheckout] = useState(false);
  const opening = useRef(false);

  const buyGalToolkit = async (plan: PremiereGalPlanId, offer?: PremiereGalOffer) => {
    if (opening.current) return;
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

    const settings = { displayMode: "overlay", theme: "light", allowLogout: false } as const;
    try {
      if (offer?.source === "black-friday") {
        opening.current = true;
        setOpeningCheckout(true);
        const response = await fetch("/api/premiere-gal/sale-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan }),
        });
        const data = await response.json() as { transactionId?: string; error?: string };
        if (!response.ok || !data.transactionId) throw new Error(data.error || "Could not prepare the discounted checkout.");
        paddle.Checkout.open({ settings, transactionId: data.transactionId, customer: { email: user.email } });
        return;
      }

      // Paddle customData values must be strings (Laravel Blade sent buyer_id as a string).
      paddle.Checkout.open({
        settings,
        items: [{ priceId, quantity: 1 }],
        customer: { email: user.email },
        customData: {
          buyer_id: String(user.id),
          plan,
        },
        ...(offer ? { discountId: offer.id } : {}),
      });
    } catch (err) {
      console.error("[premiere-gal] paddle checkout open failed:", err);
      toast.error(err instanceof Error ? err.message : "Could not open checkout. Please try again.");
    } finally {
      opening.current = false;
      setOpeningCheckout(false);
    }
  };

  return { buyGalToolkit, openingCheckout };
}
