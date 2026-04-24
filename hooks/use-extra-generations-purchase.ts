"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { usePaddle } from "@/lib/paddle";
import {
  EXTRA_GEN_PACKS,
  packsWithConfiguredCheckout,
} from "@/lib/extra-generation-packs";

export function useExtraGenerationsPurchase(options?: {
  onSuccess?: () => void | Promise<void>;
}) {
  const { onSuccess } = options ?? {};
  const { user, openSignIn } = useAuth();
  const { paddle, ready, subscribe } = usePaddle();
  const [buyOpen, setBuyOpen] = useState(false);
  const [selectedCount, setSelectedCount] = useState(50);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const awaitingExtraCheckout = useRef(false);

  const openBuyDialog = useCallback(() => {
    const priced = packsWithConfiguredCheckout();
    if (priced.length > 0) {
      const stillValid = priced.some((p) => p.count === selectedCount);
      if (!stillValid) {
        setSelectedCount(priced[0]!.count);
      }
    }
    setBuyOpen(true);
  }, [selectedCount]);

  useEffect(() => {
    return subscribe((event) => {
      if (!awaitingExtraCheckout.current) return;
      if (event.name === "checkout.completed") {
        awaitingExtraCheckout.current = false;
        setBuyOpen(false);
        toast.success("Payment successful! Updating your balance…");
        const transactionId = event.data?.transaction_id ?? null;
        // Fire-and-forget: hit the server-side claim endpoint so the credit is
        // applied even when the Paddle webhook can't reach this environment
        // (e.g. local dev without a public tunnel). The endpoint is idempotent
        // — if the webhook beat us to it the second call is a no-op. Either
        // way we refresh the user-visible balance afterwards.
        void (async () => {
          if (transactionId) {
            try {
              await fetch("/api/me/extra-generations/claim", {
                method: "POST",
                credentials: "include",
                cache: "no-store",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ transactionId }),
              });
            } catch (err) {
              console.warn(
                "[extra-generations] claim endpoint failed; relying on Paddle webhook:",
                err,
              );
            }
          }
          try {
            await onSuccess?.();
          } catch {
            // Caller's refresh failures are surfaced through their own UI.
          }
        })();
      } else if (event.name === "checkout.error") {
        awaitingExtraCheckout.current = false;
      }
    });
  }, [subscribe, onSuccess]);

  const continuePurchase = useCallback(() => {
    const pack = EXTRA_GEN_PACKS.find((p) => p.count === selectedCount);
    if (!pack) return;

    if (!user) {
      setBuyOpen(false);
      openSignIn("signin");
      return;
    }

    if (pack.priceId && paddle) {
      setCheckoutLoading(true);
      awaitingExtraCheckout.current = true;
      try {
        paddle.Checkout.open({
          settings: {
            displayMode: "overlay",
            theme: "light",
            allowLogout: false,
          },
          items: [{ priceId: pack.priceId, quantity: 1 }],
          customer: { email: user.email ?? undefined },
          customData: {
            userId: String(user.id),
            kind: "extra_ai_generations",
            generations: String(pack.count),
          },
        });
      } catch (err) {
        awaitingExtraCheckout.current = false;
        console.error("[Paddle] extra generations checkout:", err);
        toast.error("Could not open checkout. Please try again.");
      } finally {
        setCheckoutLoading(false);
      }
      return;
    }

    if (pack.priceId && !paddle) {
      toast.error(ready ? "Checkout is not ready yet. Please try again." : "Checkout is still loading…");
      return;
    }

    toast.error("Extra generation checkout is not configured for this pack.");
  }, [user, paddle, ready, openSignIn, selectedCount]);

  const selectedPack =
    EXTRA_GEN_PACKS.find((p) => p.count === selectedCount) ?? EXTRA_GEN_PACKS[1]!;
  const purchaseDisabled =
    checkoutLoading ||
    !selectedPack.priceId ||
    (Boolean(selectedPack.priceId) && !paddle);

  return {
    buyOpen,
    setBuyOpen,
    openBuyDialog,
    selectedCount,
    setSelectedCount,
    continuePurchase,
    checkoutLoading,
    purchaseDisabled,
  };
}
