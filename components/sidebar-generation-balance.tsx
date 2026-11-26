"use client";

import Link from "next/link";
import { ArrowUpRight, RotateCw, Sparkles } from "lucide-react";
import type { GenerationStatus } from "@/hooks/use-generations";
import { cn } from "@/lib/utils";

type Props = {
  status: GenerationStatus | null;
  loading: boolean;
  error: string | null;
  collapsed: boolean;
  guest?: boolean;
  onRetry: () => void;
  onNavigate: () => void;
};

export function SidebarGenerationBalance({ status, loading, error, collapsed, guest = false, onRetry, onNavigate }: Props) {
  const remaining = status ? Math.max(0, status.total_generations_left) : null;
  const planLabel = status ? ({ creator_ai: "Creator + AI", creator: "Creator", none: "Free" } as const)[status.plan] : null;
  const label = remaining === null ? (error ? "Generation balance unavailable" : "Loading generation balance") : `${planLabel} · ${remaining.toLocaleString("en-US")} generations remaining`;
  // The plan has a fixed allowance; extra credits are shown separately because
  // the API exposes their balance, not the original purchased quantity.
  const allowance = Math.max(0, status?.effective_limit ?? status?.limit ?? 0);
  const planLeft = Math.max(0, status?.subscription_generations_left ?? 0);
  const progress = allowance > 0 ? Math.min(100, planLeft / allowance * 100) : null;
  const showUpgrade = guest || (!!status && status.plan !== "creator_ai");
  const className = "relative block h-[78px] w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500";
  const containerClassName = cn("group relative w-full overflow-hidden rounded-2xl border border-blue-500/20 bg-linear-to-br from-blue-500/10 via-purple-500/5 to-cyan-500/10 transition-colors hover:border-blue-400/50", showUpgrade ? "h-32" : "h-20");
  const formattedRemaining = remaining === null ? "—" : remaining.toLocaleString("en-US");
  const content = <>
    <span className="sr-only" aria-live="polite" aria-atomic="true">{label}</span>
    {/* Both layouts stay mounted. Fixed geometry prevents reflow while the sidebar grows. */}
    <div aria-hidden="true" className={cn(
      "absolute left-3 top-3 w-[212px] transition-opacity duration-150 motion-reduce:transition-none",
      collapsed ? "opacity-0 delay-0" : "opacity-100 delay-150 motion-reduce:delay-0",
    )}>
      <div className="flex h-5 items-center gap-2 whitespace-nowrap">
        <Sparkles className="size-3.5 shrink-0 text-blue-400" />
        <span className="flex-1 text-[11px] font-semibold text-foreground">{guest ? "Free generations" : "Generations left"}</span>
        <span className={cn("text-base font-semibold tabular-nums", remaining === 0 ? "text-muted-foreground" : "text-foreground", loading && !status && "animate-pulse")}>{formattedRemaining}</span>
        {error && !status && <RotateCw className="size-3 shrink-0 text-blue-400" />}
      </div>
      {error && !status ? <p className="mt-1 whitespace-nowrap text-[10px] text-muted-foreground">Couldn’t load balance · Retry</p> : status && <div className="mt-1 flex items-center justify-between gap-2 whitespace-nowrap text-[10px]"><span className="font-medium text-blue-400">{planLabel}</span>{guest && <span className="text-muted-foreground">Sign in to use</span>}{status.extra_generations_left > 0 && <span className="text-muted-foreground">{planLeft.toLocaleString("en-US")} plan · <span className="text-blue-400">{status.extra_generations_left.toLocaleString("en-US")} extra</span></span>}</div>}
    </div>
    <div aria-hidden="true" className={cn(
      "absolute inset-x-0 top-3 flex flex-col items-center gap-1.5 transition-opacity duration-150 motion-reduce:transition-none",
      collapsed ? "opacity-100 delay-150 motion-reduce:delay-0" : "opacity-0 delay-0",
    )}>
      <Sparkles className="size-3.5 shrink-0 text-blue-400" />
      <span className={cn("text-xs font-semibold tabular-nums", remaining === 0 ? "text-muted-foreground" : "text-foreground", loading && !status && "animate-pulse")}>{formattedRemaining}</span>
    </div>
    <div
      role={progress !== null ? "progressbar" : undefined}
      aria-label={progress !== null ? "Subscription generations remaining" : undefined}
      aria-valuemin={progress !== null ? 0 : undefined}
      aria-valuemax={progress !== null ? allowance : undefined}
      aria-valuenow={progress !== null ? Math.min(planLeft, allowance) : undefined}
      aria-valuetext={progress !== null ? `${planLeft} of ${allowance} plan generations remaining` : undefined}
      title={progress !== null ? `${planLeft} / ${allowance} plan generations` : undefined}
      className={cn("absolute bottom-3 h-1.5 overflow-hidden rounded-full bg-blue-500/10 transition-[left,right] duration-300 ease-in-out motion-reduce:transition-none", collapsed ? "left-2 right-2" : "left-3 right-3")}
    >
      <div className={cn("h-full rounded-full bg-linear-to-r from-blue-600 to-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.35)] transition-[width] duration-500 motion-reduce:transition-none", loading && !status && "w-full animate-pulse")} style={status ? { width: `${progress ?? (remaining ? 100 : 0)}%` } : undefined} />
    </div>

  </>;
  return <div className={containerClassName}>
    {error && !status ? <button type="button" className={className} title={label} aria-label={`${label}. Retry`} onClick={onRetry}>{content}</button> : <Link href={guest ? "/ai-tools" : "/profile/generations"} className={className} title={guest ? "5 free generations after signing in" : label} aria-label={guest ? "5 free generations after signing in" : label} aria-busy={loading && !status} onClick={onNavigate}>{content}</Link>}
    {showUpgrade && <Link href="/pricing" aria-label="Upgrade your plan" onClick={onNavigate} className="absolute inset-x-3 bottom-3 flex h-8 items-center justify-center overflow-hidden rounded-xl bg-linear-to-r from-blue-600 to-blue-500 text-xs font-semibold text-white shadow-lg shadow-blue-500/25 transition-colors hover:from-blue-500 hover:to-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
      <span aria-hidden className={cn("absolute whitespace-nowrap transition-opacity duration-150 motion-reduce:transition-none", collapsed ? "opacity-0 delay-0" : "opacity-100 delay-150 motion-reduce:delay-0")}>Upgrade Now</span>
      <ArrowUpRight aria-hidden className={cn("size-4 transition-opacity duration-150 motion-reduce:transition-none", collapsed ? "opacity-100 delay-150 motion-reduce:delay-0" : "opacity-0 delay-0")} />
    </Link>}
  </div>;
}
