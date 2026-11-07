"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { usePaddle } from "@/lib/paddle";
import { useAuth } from "@/components/auth-provider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  SPUNKRAM_LICENSE_OPTIONS,
  type SpunkramLicenseType,
} from "@/lib/spunkram-paddle-config";

export function ItemCheckoutCard({
  itemId,
  basePrice,
  withoutProjectFile = false,
  children,
}: {
  itemId: number;
  basePrice: number;
  withoutProjectFile?: boolean;
  children?: ReactNode;
}) {
  const { paddle, subscribe } = usePaddle();
  const router = useRouter();
  const { user, openSignIn } = useAuth();
  const [licenseType, setLicenseType] = useState<SpunkramLicenseType>("personal");
  const [isOpening, setIsOpening] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const awaitingCheckout = useRef(false);

  const selected = SPUNKRAM_LICENSE_OPTIONS.find((opt) => opt.value === licenseType)!;
  const checkoutAmount = Math.max(0, Number(basePrice) || 0) * selected.multiplier;

  useEffect(() => {
    return subscribe((event) => {
      if (!awaitingCheckout.current) return;
      if (event.name === "checkout.completed") {
        awaitingCheckout.current = false;
        setIsOpening(false);
        paddle?.Checkout.close();
        setFeedback("Payment successful. Access is being activated.");
        router.refresh();
      }
      if (event.name === "checkout.error" || event.name === "checkout.closed") {
        awaitingCheckout.current = false;
        setIsOpening(false);
      }
    });
  }, [subscribe, paddle, router]);

  const openCheckout = async () => {
    if (awaitingCheckout.current) return;
    setFeedback(null);

    if (!user) {
      openSignIn("signin");
      return;
    }
    if (!paddle) {
      setFeedback("Secure checkout is loading. Please try again in a moment.");
      return;
    }

    setIsOpening(true);
    awaitingCheckout.current = true;

    try {
      const response = await fetch("/api/spunkram/item-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, license: licenseType }),
      });
      const result = await response.json() as { transactionId?: string; error?: string };
      if (!response.ok || !result.transactionId) {
        throw new Error(result.error || "Could not prepare secure checkout.");
      }

      paddle.Checkout.open({
        settings: {
          displayMode: "overlay",
          theme: "light",
          allowLogout: false,
        },
        transactionId: result.transactionId,
        customer: { email: user.email ?? undefined },
      });
    } catch (err) {
      awaitingCheckout.current = false;
      setIsOpening(false);
      setFeedback(err instanceof Error ? err.message : "Could not open checkout. Please try again.");
      console.error("[spunkram-item] paddle checkout open failed:", err);
    }
  };

  return (
    <div className="flex flex-col py-2">
      <div className="flex items-end gap-3">
        <div className="min-w-24 flex-[0.8]">
          <div className="text-sm text-muted">Price</div>
          <div className="mt-1 text-3xl font-semibold text-foreground">{checkoutAmount === 0 ? "Free" : `$${checkoutAmount}`}</div>
        </div>

        <div className="min-w-44 flex-[1.2] text-sm text-muted">
          <span className="inline-flex items-center gap-1.5">
            License type
            <span className="group/tooltip relative inline-flex items-center">
              <button
                type="button"
                aria-label="License info"
                aria-describedby="spunkram-license-info"
                className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
              <span
                id="spunkram-license-info"
                role="tooltip"
                className="pointer-events-none invisible absolute right-0 top-6 z-20 w-56 rounded-lg border border-white/12 bg-[#11152f] px-3 py-2 text-xs font-normal leading-relaxed text-muted opacity-0 shadow-xl transition-all duration-150 group-hover/tooltip:visible group-hover/tooltip:opacity-100 group-focus-within/tooltip:visible group-focus-within/tooltip:opacity-100"
              >
                <span className="block font-semibold text-foreground">Personal License</span>
                <span className="mt-1 block">For personal, non-commercial projects only. Not for monetized content or client work.</span>
                <span className="mt-3 block font-semibold text-foreground">Commercial License</span>
                <span className="mt-1 block">For commercial and monetized projects, including paid client work.</span>
              </span>
            </span>
          </span>
          <Select
            value={licenseType}
            disabled={isOpening}
            onValueChange={(value) => setLicenseType(value as SpunkramLicenseType)}
          >
            <SelectTrigger className="mt-1.5 !h-8 w-full rounded-lg border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] px-2.5 !py-1 text-xs font-medium text-foreground shadow-[inset_0_1px_0_0_rgb(255_255_255/0.14)] focus-visible:border-brand-500/70 focus-visible:ring-brand-500/20 data-placeholder:text-foreground">
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

      {children}
      <div className="pt-4">
      <button
        type="button"
        onClick={openCheckout}
        disabled={isOpening}
        className="inline-flex w-full items-center justify-center rounded-xl bg-brand-violet px-4 py-2.5 text-sm font-semibold text-white shadow-[0_14px_28px_-16px_rgb(110_60_255/0.92)] transition-all hover:bg-brand-violet-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isOpening ? "Opening secure checkout..." : "Buy now"}
      </button>
      {!withoutProjectFile ? (
        <p className="mt-2 text-center text-[11px] text-muted">
          One-time purchase. Start using this pack in minutes.
        </p>
      ) : null}

      {feedback ? <p className="mt-3 text-xs text-muted">{feedback}</p> : null}
      </div>
    </div>
  );
}
