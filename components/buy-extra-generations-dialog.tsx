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
import { EXTRA_GEN_PACKS } from "@/lib/extra-generation-packs";

type ExtraGenPack = { count: number; priceId: string | undefined };

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
  onContinue: (priceId?: string) => void;
  continueLoading: boolean;
  continueDisabled: boolean;
  packs?: readonly ExtraGenPack[];
  pricesUrl?: string;
}

export function BuyExtraGenerationsDialog({
  open,
  onOpenChange,
  selectedCount,
  onSelectCount,
  onContinue,
  continueLoading,
  continueDisabled,
  packs = EXTRA_GEN_PACKS,
  pricesUrl = "/api/paddle/extra-generation-prices",
}: BuyExtraGenerationsDialogProps) {
  const [priceByCount, setPriceByCount] = useState<
    Record<number, { priceId: string | null; label: string | null }>
  >({});
  const [pricesLoading, setPricesLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPricesLoading(true);
    void fetch(pricesUrl, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) return;
        const body = (await r.json()) as { items?: PriceRow[] };
        if (cancelled) return;
        const map: Record<number, { priceId: string | null; label: string | null }> = {};
        for (const row of body.items ?? []) {
          map[row.count] = { priceId: row.priceId, label: row.label };
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
  }, [open, pricesUrl]);

  function resolvedPriceId(count: number): string | undefined {
    const fromApi = priceByCount[count]?.priceId?.trim();
    if (fromApi) return fromApi;
    return packs.find((pack) => pack.count === count)?.priceId?.trim() || undefined;
  }

  const selectedPriceId = resolvedPriceId(selectedCount);
  const anyPackReady = packs.some((pack) => Boolean(resolvedPriceId(pack.count)));
  const checkoutUnavailable = !pricesLoading && !anyPackReady;

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
          {packs.map(({ count }) => {
            const selected = selectedCount === count;
            const priceId = resolvedPriceId(count);
            const unavailable = checkoutUnavailable || (!pricesLoading && !priceId);
            const priceLabel = !priceId
              ? null
              : pricesLoading
                ? "…"
                : (priceByCount[count]?.label ?? "—");
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
                  {priceLabel ?? "\u00a0"}
                </span>
              </button>
            );
          })}
        </div>

        {checkoutUnavailable ? (
          <p className="text-xs text-muted-foreground">
            Checkout is temporarily unavailable. Please try again later.
          </p>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => onContinue(selectedPriceId)}
            disabled={
              continueDisabled ||
              continueLoading ||
              pricesLoading ||
              !selectedPriceId
            }
            className="bg-linear-to-r from-blue-600 to-blue-500 text-white"
          >
            {continueLoading ? "Opening…" : "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
