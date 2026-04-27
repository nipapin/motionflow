"use client";

import { Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { GenerationStatus } from "@/hooks/use-generations";

interface GenerationsBadgeProps {
  status: GenerationStatus | null;
  loading: boolean;
  authenticated: boolean;
  /** Set when the quota API failed (avoids looking like infinite loading). */
  error?: string | null;
}

function GenerationsBadgeSkeleton() {
  return (
    <div
      className="shrink-0 flex items-center gap-2 sm:gap-2.5 px-2.5 py-2 sm:px-4 sm:py-2.5 rounded-xl border border-blue-500/20 bg-card/50"
      aria-hidden
    >
      <Skeleton className="size-8 sm:size-9 shrink-0 rounded-sm" />
      <div className="min-w-0 text-left">
        <Skeleton className="h-2.5 w-17 sm:w-16 rounded-sm" />
        <Skeleton className="h-2.5 w-14 sm:w-15 rounded-sm mt-1" />
        <Skeleton className="h-4.5 sm:h-6 w-9 sm:w-11 rounded-sm mt-2" />
      </div>
    </div>
  );
}

/**
 * Monthly generation quota for Motionflow Creator (5/mo) and Creator + AI (100/mo).
 * Guests and users without a paid catalog plan get no badge.
 */
export function GenerationsBadge({
  status,
  loading,
  authenticated,
}: GenerationsBadgeProps) {
  if (!authenticated) {
    return null;
  }

  const showQuota =
    !!status &&
    (status.plan === "creator" || status.plan === "creator_ai");

  /** Initial fetch only — avoids layout shift; keep real badge during refresh when status is cached. */
  if (loading && !status) {
    return <GenerationsBadgeSkeleton />;
  }
  if (!showQuota) {
    return null;
  }

  const isCreatorAi = status.plan === "creator_ai";
  const primary = isCreatorAi
    ? String(status.total_generations_left)
    : `${status.remaining} / ${status.limit}`;
  return (
    <div className="shrink-0 flex items-center gap-2 sm:gap-2.5 px-2.5 py-2 sm:px-4 sm:py-2.5 rounded-xl border border-blue-500/30 bg-card/50">
      <div className="size-8 sm:size-9 shrink-0 rounded-sm bg-linear-to-br from-blue-600 to-indigo-500 flex items-center justify-center">
        <Sparkles className="size-4 sm:size-[18px] text-white" />
      </div>
      <div className="min-w-0 text-left">
        <p className="text-[10px] sm:text-xs text-muted-foreground leading-[1.15]">
          <span className="block">Generations</span>
          <span className="block">remaining</span>
        </p>
        <p className="mt-2 text-base sm:text-lg font-semibold text-foreground tabular-nums leading-none">
          {primary}
        </p>
      </div>
    </div>
  );
}
