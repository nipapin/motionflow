"use client";

import Link from "next/link";
import { Infinity, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GenerationStatus } from "@/hooks/use-generations";
import { Button } from "@/components/ui/button";
import { BuyExtraGenerationsDialog } from "@/components/buy-extra-generations-dialog";
import { useExtraGenerationsPurchase } from "@/hooks/use-extra-generations-purchase";

interface ProfileGenerationsQuotaProps {
  status: GenerationStatus | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
}

export function ProfileGenerationsQuota({ status, loading, error, onRefresh }: ProfileGenerationsQuotaProps) {
  const {
    buyOpen,
    setBuyOpen,
    openBuyDialog,
    selectedCount,
    setSelectedCount,
    continuePurchase,
    checkoutLoading,
    purchaseDisabled,
  } = useExtraGenerationsPurchase({ onSuccess: onRefresh });

  if (loading && !status) {
    return (
      <div
        className="relative w-full overflow-hidden rounded-2xl border border-border/50 bg-card/60 p-6 shadow-lg glow dark:border-white/10 dark:bg-card/40"
        aria-busy
        aria-label="Loading generation quota"
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet-500/20 blur-3xl dark:bg-violet-500/15" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-44 w-44 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-4">
            <div className="h-14 w-14 shrink-0 animate-pulse rounded-2xl bg-muted dark:bg-white/10" />
            <div className="space-y-3 pt-1">
              <div className="h-2.5 w-32 animate-pulse rounded-full bg-muted dark:bg-white/10" />
              <div className="h-10 w-24 animate-pulse rounded-lg bg-muted dark:bg-white/10" />
              <div className="flex gap-2">
                <div className="h-7 w-28 animate-pulse rounded-full bg-muted/80 dark:bg-white/5" />
                <div className="h-7 w-36 animate-pulse rounded-full bg-muted/80 dark:bg-white/5" />
              </div>
            </div>
          </div>
          <div className="h-11 w-full max-w-[200px] animate-pulse rounded-xl bg-muted sm:shrink-0 dark:bg-white/10" />
        </div>
      </div>
    );
  }

  if (error) {
    return null;
  }

  if (!status || status.plan !== "creator_ai") {
    return (
      <div className="relative w-full overflow-hidden rounded-2xl border border-primary/20 bg-linear-to-br from-card/95 via-card/80 to-primary/7 p-5 shadow-md glow dark:border-blue-500/25 dark:from-card/90 dark:via-card/70 dark:to-violet-950/25">
        <div className="pointer-events-none absolute -right-20 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-primary/15 blur-3xl dark:bg-blue-500/10" />
        <p className="relative text-sm leading-relaxed text-muted-foreground">
          AI generation quotas apply to the <span className="font-medium text-foreground">Creator + AI</span> plan.{" "}
          <Link
            href="/pricing"
            className="font-semibold text-primary underline underline-offset-4 hover:text-primary/90"
          >
            View plans
          </Link>
        </p>
      </div>
    );
  }

  const { extra_generations_left, total_generations_left, subscription_generations_left } = status;

  const depleted = total_generations_left <= 0;

  return (
    <div className="w-full space-y-3">
      <div
        className={cn(
          "relative isolate w-full overflow-hidden rounded-2xl p-px shadow-xl glow",
          "bg-linear-to-br from-primary/45 via-violet-500/35 to-cyan-500/30",
          depleted && "from-amber-500/40 via-orange-500/30 to-rose-500/25",
        )}
      >
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl border backdrop-blur-xl",
            "border-primary/20 bg-linear-to-br from-card via-card to-primary/6 dark:border-blue-500/30",
            "dark:from-[hsl(222_47%_12%)] dark:via-[hsl(222_47%_10%)] dark:to-[hsl(217_45%_16%)]",
            depleted && "border-amber-500/20 dark:from-[hsl(222_47%_12%)] dark:via-amber-950/20 dark:to-rose-950/25",
          )}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/40 to-transparent dark:via-sky-400/35" />
          <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl dark:bg-sky-500/25" />
          <div
            className={cn(
              "pointer-events-none absolute -bottom-32 -left-16 h-64 w-64 rounded-full blur-3xl",
              depleted ? "bg-rose-500/20 dark:bg-rose-600/15" : "bg-cyan-500/25 dark:bg-cyan-500/18",
            )}
          />

          <div className="relative z-10 flex flex-col gap-6 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
            <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    AI generations left
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-end gap-x-2 gap-y-1">
                    <span
                      className={cn(
                        "text-[2.35rem] font-bold leading-none tracking-tight tabular-nums sm:text-5xl",
                        depleted
                          ? "text-amber-600 dark:text-amber-50"
                          : "bg-linear-to-br from-foreground via-foreground/90 to-muted-foreground bg-clip-text text-transparent dark:from-white dark:via-slate-100 dark:to-slate-400",
                      )}
                    >
                      {total_generations_left}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium backdrop-blur-sm",
                      "border-border/60 bg-muted/40 text-foreground/90",
                      "dark:border-white/10 dark:bg-white/5 dark:text-slate-300",
                    )}
                  >
                    <Zap className="h-3.5 w-3.5 text-amber-500 dark:text-amber-300/90" aria-hidden />
                    {subscription_generations_left} this period
                  </span>
                  {extra_generations_left > 0 ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[11px] font-medium text-cyan-800 backdrop-blur-sm dark:border-cyan-500/25 dark:text-cyan-100/95">
                      <Infinity className="h-3.5 w-3.5 shrink-0 text-cyan-600 dark:text-cyan-300/90" aria-hidden />
                      {extra_generations_left} extra · no expiry
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center lg:flex-col lg:items-stretch">
              {depleted ? (
                <Button
                  type="button"
                  size="lg"
                  onClick={openBuyDialog}
                  className="h-11 rounded-xl bg-linear-to-r from-amber-500 to-orange-500 px-6 font-semibold text-white shadow-lg shadow-amber-500/25 transition-[transform,box-shadow] hover:scale-[1.02] hover:shadow-amber-500/35 active:scale-[0.99]"
                >
                  Buy generations
                </Button>
              ) : (
                <Button
                  type="button"
                  size="lg"
                  onClick={openBuyDialog}
                  className="h-11 rounded-xl bg-linear-to-r from-primary to-sky-500 px-6 font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-[transform,box-shadow] hover:scale-[1.01] hover:from-primary/90 hover:to-sky-500/90 active:scale-[0.99]"
                >
                  Buy extra
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <BuyExtraGenerationsDialog
        open={buyOpen}
        onOpenChange={setBuyOpen}
        selectedCount={selectedCount}
        onSelectCount={setSelectedCount}
        onContinue={continuePurchase}
        continueLoading={checkoutLoading}
        continueDisabled={purchaseDisabled}
      />
    </div>
  );
}
