"use client";

import { useEffect } from "react";
import { BuyExtraGenerationsDialog } from "@/components/buy-extra-generations-dialog";
import { useAuth } from "@/components/auth-provider";
import { useExtraGenerationsPurchase } from "@/hooks/use-extra-generations-purchase";
import {
  SPUNKRAM_AUTHOR_ID,
  SPUNKRAM_EXTRA_GEN_PACKS,
} from "@/lib/spunkram-paddle-config";

const PRICES_URL = "/api/paddle/extra-generation-prices?account=spunkram";

export function SpunkramBuyExtraCredits({ openOnLoad }: { openOnLoad: boolean }) {
  const { user } = useAuth();
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
    packs: SPUNKRAM_EXTRA_GEN_PACKS,
    authorId: SPUNKRAM_AUTHOR_ID,
  });

  useEffect(() => {
    if (!openOnLoad) return;
    if (new URLSearchParams(window.location.search).get("buy") !== "extra") return;
    openBuyDialog();
  }, [openOnLoad, openBuyDialog, user]);

  function onOpenChange(open: boolean) {
    setBuyOpen(open);
    if (open || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("buy") !== "extra") return;
    url.searchParams.delete("buy");
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(null, "", next);
  }

  return (
    <BuyExtraGenerationsDialog
      open={buyOpen}
      onOpenChange={onOpenChange}
      selectedCount={selectedCount}
      onSelectCount={setSelectedCount}
      onContinue={continuePurchase}
      continueLoading={checkoutLoading}
      continueDisabled={purchaseDisabled}
      packs={SPUNKRAM_EXTRA_GEN_PACKS}
      pricesUrl={PRICES_URL}
    />
  );
}
