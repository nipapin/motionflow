"use client";

import { CheckIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
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
  appearance?: "spunkram";
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
  appearance,
}: BuyExtraGenerationsDialogProps) {
  const isSpunkram = appearance === "spunkram";
  const titleRef = useRef<HTMLHeadingElement>(null);
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
      <DialogContent
        showCloseButton={!isSpunkram}
        onOpenAutoFocus={isSpunkram ? (event) => {
          if (!titleRef.current) return;
          event.preventDefault();
          titleRef.current.focus();
        } : undefined}
        className={cn(
          "data-[state=closed]:animate-none sm:max-w-md",
          isSpunkram && "max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto rounded-[28px] border-line-strong/60 bg-surface p-5 shadow-2xl shadow-black/30 motion-reduce:data-[state=open]:animate-none sm:max-w-[29rem] sm:p-7",
        )}
      >
        {isSpunkram ? (
          <DialogClose
            aria-label="Close"
            className="absolute top-3 right-3 grid size-11 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500"
          >
            <XIcon aria-hidden="true" className="size-4" />
          </DialogClose>
        ) : null}
        <DialogHeader className={isSpunkram ? "pr-8 text-left" : undefined}>
          <DialogTitle
            ref={isSpunkram ? titleRef : undefined}
            tabIndex={isSpunkram ? -1 : undefined}
            className={isSpunkram ? "text-[1.375rem] leading-tight tracking-tight outline-none sm:text-2xl" : undefined}
          >
            Buy extra generations
          </DialogTitle>
          <DialogDescription className={isSpunkram ? "leading-relaxed text-muted" : undefined}>
            Choose a pack. Extra generations are used after your monthly quota
            and do not expire.
          </DialogDescription>
        </DialogHeader>

        <div
          className={cn("flex flex-col gap-2", !isSpunkram && "py-1")}
          role={isSpunkram ? "group" : "list"}
          aria-label={isSpunkram ? "Generation packs" : undefined}
        >
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
                role={isSpunkram ? undefined : "listitem"}
                aria-pressed={isSpunkram ? selected : undefined}
                disabled={unavailable}
                onClick={() => onSelectCount(count)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 border px-4 py-3 text-left transition-colors",
                  isSpunkram
                    ? cn(
                        "min-h-14 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
                        selected
                          ? "border-brand-500/70 bg-brand-500/12"
                          : "border-line bg-surface-2/45 enabled:hover:border-line-strong enabled:hover:bg-surface-2",
                      )
                    : cn(
                        "rounded-xl",
                        selected
                          ? "border-blue-500/50 bg-blue-500/15 shadow-md shadow-blue-500/10"
                          : "border-border/60 bg-background/40 hover:border-blue-500/30 hover:bg-blue-500/5",
                      ),
                  unavailable && "opacity-40 cursor-not-allowed",
                )}
              >
                <div className={isSpunkram ? "flex items-baseline gap-x-2" : undefined}>
                  <span className={cn("text-lg font-semibold tabular-nums text-foreground", isSpunkram && "text-xl tracking-tight")}>
                    {count}
                  </span>
                  <span className={cn("text-sm text-muted-foreground", isSpunkram ? "text-muted" : "ml-2")}>generations</span>
                </div>
                <span className={cn("text-sm font-medium tabular-nums text-foreground", isSpunkram && "flex shrink-0 items-center gap-2.5 font-semibold")}>
                  <span>{priceLabel ?? "\u00a0"}</span>
                  {isSpunkram ? (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "grid size-[18px] place-items-center rounded-full border",
                        selected ? "border-brand-600 bg-brand-600 text-white" : "border-line-strong",
                      )}
                    >
                      {selected ? <CheckIcon className="size-3" strokeWidth={2.5} /> : null}
                    </span>
                  ) : null}
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

        <DialogFooter className={cn("gap-2 sm:gap-2", isSpunkram && "border-t border-line/70 pt-4")}>
          <Button
            type="button"
            variant={isSpunkram ? "ghost" : "outline"}
            className={isSpunkram ? "h-11 rounded-full border border-line bg-surface/50 px-5 font-semibold text-foreground hover:bg-surface-2 hover:text-foreground focus-visible:ring-brand-500/60" : undefined}
            onClick={() => onOpenChange(false)}
          >
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
            className={isSpunkram
              ? "h-11 rounded-full bg-brand-violet px-6 font-semibold text-white hover:bg-brand-violet-hover focus-visible:ring-brand-500/60"
              : "bg-linear-to-r from-blue-600 to-blue-500 text-white"}
          >
            {continueLoading ? "Opening…" : "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
