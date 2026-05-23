"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Info } from "lucide-react";
import { usePaddle } from "@/lib/paddle";
import { useAuth } from "@/components/auth-provider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  extractSpunkramPriceIdsFromJsonArgs,
  SPUNKRAM_LICENSE_OPTIONS,
  type SpunkramLicenseType,
} from "@/lib/spunkram-paddle-config";

export function ItemCheckoutCard({
  itemId,
  itemName,
  basePrice,
  jsonArgs,
}: {
  itemId: number;
  itemName: string;
  basePrice: number;
  jsonArgs: string | null;
}) {
  const { paddle, ready, subscribe } = usePaddle();
  const { user, openSignIn } = useAuth();
  const [licenseType, setLicenseType] = useState<SpunkramLicenseType>("personal");
  const [isOpening, setIsOpening] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const awaitingCheckout = useRef(false);

  const pricing = useMemo(
    () => extractSpunkramPriceIdsFromJsonArgs(jsonArgs),
    [jsonArgs],
  );
  const selected = SPUNKRAM_LICENSE_OPTIONS.find((opt) => opt.value === licenseType)!;
  const checkoutAmount = Math.max(0, Number(basePrice) || 0) * selected.multiplier;
  const selectedPriceId =
    licenseType === "commercial" ? (pricing.commercial ?? pricing.personal) : pricing.personal;
  const selectedQuantity =
    licenseType === "commercial" && !pricing.commercial ? selected.multiplier : 1;

  useEffect(() => {
    return subscribe((event) => {
      if (!awaitingCheckout.current) return;
      if (event.name === "checkout.completed") {
        awaitingCheckout.current = false;
        setIsOpening(false);
        setFeedback("Payment successful. Access is being activated.");
      }
      if (event.name === "checkout.error" || event.name === "checkout.closed") {
        awaitingCheckout.current = false;
        setIsOpening(false);
      }
    });
  }, [subscribe]);

  const openCheckout = () => {
    setFeedback(null);

    if (!user) {
      openSignIn("signin");
      return;
    }
    if (!selectedPriceId) {
      setFeedback("Paddle price id is missing in item json_args.");
      return;
    }
    if (!paddle) {
      setFeedback(ready ? "Checkout is not ready yet. Please retry." : "Checkout is still loading.");
      return;
    }

    setIsOpening(true);
    awaitingCheckout.current = true;

    try {
      paddle.Checkout.open({
        settings: {
          displayMode: "overlay",
          theme: "light",
          allowLogout: false,
        },
        items: [{ priceId: selectedPriceId, quantity: selectedQuantity }],
        customer: { email: user.email ?? undefined },
        customData: {
          buyer_id: Number(user.id),
          kind: "spunkram_item",
          item_id: Number(itemId),
          itemName,
          license: licenseType,
          pricingSource: pricing.commercial && licenseType === "commercial" ? "json_args_commercial_price" : "json_args_personal_price",
        },
      });
    } catch (err) {
      awaitingCheckout.current = false;
      setIsOpening(false);
      setFeedback("Could not open checkout popup. Try again.");
      console.error("[spunkram-item] paddle checkout open failed:", err);
    }
  };

  return (
    <div className="border-b border-white/10 pb-4">
      <div className="flex items-end gap-3">
        <div className="min-w-24 flex-[0.8]">
          <div className="text-sm text-muted">Price</div>
          <div className="mt-1 text-3xl font-semibold text-foreground">${checkoutAmount}</div>
        </div>

        <div className="min-w-44 flex-[1.2] text-sm text-muted">
          <span className="inline-flex items-center gap-1.5">
            License type
            <span className="group/tooltip relative inline-flex items-center">
              <button
                type="button"
                aria-label="License info"
                className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
              <span
                role="tooltip"
                className="pointer-events-none invisible absolute right-0 top-6 z-20 w-56 rounded-lg border border-white/12 bg-[#11152f] px-3 py-2 text-xs font-normal leading-relaxed text-muted opacity-0 shadow-xl transition-all duration-150 group-hover/tooltip:visible group-hover/tooltip:opacity-100"
              >
                License details will be added here soon.
              </span>
            </span>
          </span>
          <Select
            value={licenseType}
            onValueChange={(value) => setLicenseType(value as SpunkramLicenseType)}
          >
            <SelectTrigger className="mt-2 h-11 w-full rounded-xl border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] px-3 text-sm font-semibold text-foreground shadow-[inset_0_1px_0_0_rgb(255_255_255/0.14)] focus-visible:border-brand-500/70 focus-visible:ring-brand-500/20 data-placeholder:text-foreground">
              <SelectValue placeholder="Select license" />
            </SelectTrigger>
            <SelectContent
              className="z-220 w-(--radix-select-trigger-width) rounded-xl border border-white/12 bg-[#0f1229] p-1 text-foreground shadow-[0_18px_50px_-24px_rgb(0_0_0/0.75)]"
              position="popper"
            >
              {SPUNKRAM_LICENSE_OPTIONS.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  className="rounded-lg py-2 text-sm font-medium text-foreground focus:bg-brand-500/20 focus:text-white data-[state=checked]:bg-brand-500/30 data-[state=checked]:text-white"
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <button
        type="button"
        onClick={openCheckout}
        disabled={isOpening}
        className="mt-4 w-full rounded-xl bg-linear-to-r from-blue-600 to-blue-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 smooth hover:from-blue-500 hover:to-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isOpening ? "Opening secure checkout..." : "Buy now"}
      </button>
      <p className="mt-2 text-center text-[11px] text-muted">
        One-time purchase. Start using this pack in minutes.
      </p>

      {feedback ? <p className="mt-3 text-xs text-muted">{feedback}</p> : null}
    </div>
  );
}
