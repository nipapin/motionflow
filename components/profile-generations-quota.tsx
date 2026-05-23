"use client";

import Link from "next/link";
import { Infinity, Sparkles, Zap } from "lucide-react";
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
  const { buyOpen, setBuyOpen, openBuyDialog, selectedCount, setSelectedCount, continuePurchase, checkoutLoading, purchaseDisabled } =
    useExtraGenerationsPurchase({ onSuccess: onRefresh });

  if (loading && !status) {
    return (
      <div
        className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-card/40 p-6 shadow-lg glow"
        aria-busy
        aria-label="Loading generation quota"
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet-500/15 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-4">
            <div className="h-14 w-14 shrink-0 animate-pulse rounded-2xl bg-white/10" />
            <div className="space-y-3 pt-1">
              <div className="h-2.5 w-32 animate-pulse rounded-full bg-white/10" />
              <div className="h-10 w-24 animate-pulse rounded-lg bg-white/10" />
              <div className="flex gap-2">
                <div className="h-7 w-28 animate-pulse rounded-full bg-white/5" />
                <div className="h-7 w-36 animate-pulse rounded-full bg-white/5" />
              </div>
            </div>
          </div>
          <div className="h-11 w-full max-w-[200px] animate-pulse rounded-xl bg-white/10 sm:shrink-0" />
        </div>
      </div>
    );
  }

  if (error) {
    return null;
  }

  if (!status || status.plan !== "creator_ai") {
    return (
      <div className="relative w-full overflow-hidden rounded-2xl border border-blue-500/20 bg-linear-to-br from-card/90 via-card/70 to-violet-950/20 p-5 shadow-md glow">
        <div className="pointer-events-none absolute -right-20 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-blue-500/10 blur-3xl" />
        <p className="relative text-sm leading-relaxed text-muted-foreground">
          AI generation quotas apply to the <span className="font-medium text-foreground">Creator + AI</span> plan.{" "}
          <Link
            href="/pricing"
            className="font-medium text-sky-400 underline decoration-sky-500/40 underline-offset-4 transition-colors hover:text-sky-300"
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
      <div className={cn("relative isolate w-full overflow-hidden rounded-2xl p-px shadow-xl glow")}>
        <div className={cn("relative overflow-hidden rounded-2xl border border-blue-500/30 backdrop-blur-xl")}>
          <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent to-transparent")} />
          <div className={cn("pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full blur-3xl")} />
          <div
            className={cn(
              "pointer-events-none absolute -bottom-32 -left-16 h-64 w-64 rounded-full blur-3xl",
              depleted ? "bg-rose-600/15" : "bg-cyan-500/18",
            )}
          />

          <div className="relative z-10 flex flex-col gap-6 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
            <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">AI generations</p>
                  <div className="mt-1.5 flex flex-wrap items-end gap-x-2 gap-y-1">
                    <span
                      className={cn(
                        "text-[2.35rem] font-bold leading-none tracking-tight tabular-nums sm:text-5xl",
                        depleted
                          ? "text-amber-50"
                          : "bg-linear-to-br from-white via-slate-100 to-slate-400 bg-clip-text text-transparent",
                      )}
                    >
                      {total_generations_left}
                    </span>
                    <span className="pb-1 text-sm font-medium text-slate-500">left</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-slate-300 backdrop-blur-sm">
                    <Zap className="h-3.5 w-3.5 text-amber-300/90" aria-hidden />
                    {subscription_generations_left} this billing period
                  </span>
                  {extra_generations_left > 0 ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1 text-[11px] font-medium text-cyan-100/95 backdrop-blur-sm">
                      <Infinity className="h-3.5 w-3.5 shrink-0 text-cyan-300/90" aria-hidden />
                      {extra_generations_left} extra · never expire
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
                  variant="outline"
                  onClick={openBuyDialog}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium smooth bg-linear-to-r from-blue-600 to-blue-500 text-white shadow-md shadow-blue-500/20"
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
