"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { BuyExtraGenerationsDialog } from "@/components/buy-extra-generations-dialog";
import { useAuth } from "@/components/auth-provider";
import { useExtraGenerationsPurchase } from "@/hooks/use-extra-generations-purchase";
import { SPUNKRAM_AUTHOR_ID, type getSpunkramExtraGenPacks } from "@/lib/spunkram-paddle-config";

const PRICES_URL = "/api/paddle/extra-generation-prices?account=spunkram";

export function SpunkramBuyExtraCredits({ buyerId, packs }: { buyerId: number; packs: ReturnType<typeof getSpunkramExtraGenPacks> }) {
  const { user, openSignIn } = useAuth();
  const {
    buyOpen,
    setBuyOpen,
    openBuyDialog,
    selectedCount,
    setSelectedCount,
    continuePurchase,
    checkoutLoading,
    purchaseDisabled,
  } = useExtraGenerationsPurchase({
    packs,
    authorId: SPUNKRAM_AUTHOR_ID,
  });

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("extraCheckout")) return;
    openBuyDialog();
  }, [openBuyDialog, user]);

  function onOpenChange(open: boolean) {
    setBuyOpen(open);
    if (open || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("extraCheckout");
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(null, "", next);
  }

  return (
    <BuyExtraGenerationsDialog
      open={buyOpen}
      onOpenChange={onOpenChange}
      selectedCount={selectedCount}
      onSelectCount={setSelectedCount}
      onContinue={(priceId) => {
        if (!user) {
          setBuyOpen(false);
          openSignIn("signin");
          return;
        }
        if (Number(user.id) !== buyerId) {
          toast.error("Sign in with the same account as the Spunkram extension.");
          return;
        }
        onOpenChange(false);
        continuePurchase(priceId);
      }}
      continueLoading={checkoutLoading}
      continueDisabled={purchaseDisabled}
      packs={packs}
      pricesUrl={PRICES_URL}
      appearance="spunkram"
    />
  );
}
