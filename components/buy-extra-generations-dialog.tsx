"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { EXTRA_GEN_PACKS, packsWithConfiguredCheckout } from "@/lib/extra-generation-packs";

type PriceRow = {
  count: number;
  priceId: string | null;
  label: string | null;
  currency_code: string | null;
};

export interface BuyExtraGenerationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  onSelectCount: (n: number) => void;
  onContinue: () => void;
  continueLoading: boolean;
  continueDisabled: boolean;
}

export function BuyExtraGenerationsDialog({
  open,
  onOpenChange,
  selectedCount,
  onSelectCount,
  onContinue,
  continueLoading,
  continueDisabled,
}: BuyExtraGenerationsDialogProps) {
  const hasConfiguredCheckout = packsWithConfiguredCheckout().length > 0;
  const [priceByCount, setPriceByCount] = useState<
    Record<number, string | null>
  >({});
  const [pricesLoading, setPricesLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPricesLoading(true);
    void fetch("/api/paddle/extra-generation-prices", {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) return;
        const body = (await r.json()) as { items?: PriceRow[] };
        if (cancelled) return;
        const map: Record<number, string | null> = {};
        for (const row of body.items ?? []) {
          map[row.count] = row.label;
        }
        setPriceByCount(map);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPricesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Buy extra generations</DialogTitle>
          <DialogDescription>
            Choose a pack. Extra generations are used after your monthly quota
            and do not expire.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 py-1" role="list">
          {EXTRA_GEN_PACKS.map(({ count, priceId }) => {
            const selected = selectedCount === count;
            const unavailable = hasConfiguredCheckout && !priceId;
            const priceLabel =
              !priceId || unavailable
                ? null
                : pricesLoading
                  ? "…"
                  : (priceByCount[count] ?? "—");
            return (
              <button
                key={count}
                type="button"
                role="listitem"
                disabled={unavailable}
                onClick={() => onSelectCount(count)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                  selected
                    ? "border-blue-500/50 bg-blue-500/15 shadow-md shadow-blue-500/10"
                    : "border-border/60 bg-background/40 hover:border-blue-500/30 hover:bg-blue-500/5",
                  unavailable && "opacity-40 cursor-not-allowed",
                )}
              >
                <div>
                  <span className="text-lg font-semibold tabular-nums text-foreground">
                    {count}
                  </span>
                  <span className="ml-2 text-sm text-muted-foreground">generations</span>
                </div>
                <span className="text-sm font-medium tabular-nums text-foreground">
                  {priceId ? (priceLabel ?? "\u00a0") : "—"}
                </span>
              </button>
            );
          })}
        </div>

        {!hasConfiguredCheckout ? (
          <p className="text-xs text-muted-foreground">
            Set{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[0.7rem]">
              NEXT_PUBLIC_PADDLE_PRICE_EXTRA_AI_GEN_*
            </code>{" "}
            in your environment to enable checkout.
          </p>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onContinue}
            disabled={continueDisabled || continueLoading}
            className="bg-linear-to-r from-blue-600 to-blue-500 text-white"
          >
            {continueLoading ? "Opening…" : "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
