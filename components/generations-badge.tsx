"use client";

import { Sparkles } from "lucide-react";
import type { GenerationStatus } from "@/hooks/use-generations";

interface GenerationsBadgeProps {
  status: GenerationStatus | null;
  loading: boolean;
  authenticated: boolean;
  /** Set when the quota API failed (avoids looking like infinite loading). */
  error?: string | null;
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
  if (!authenticated || loading) {
    return null;
  }
  if (!status || (status.plan !== "creator" && status.plan !== "creator_ai")) {
    return null;
  }

  const primary = `${status.remaining} / ${status.limit}`;
  const secondary = "Generations remaining";

  return (
    <div className="flex items-center gap-3 px-5 py-3 rounded-xl border border-blue-500/30 bg-card/50">
      <div className="w-10 h-10 rounded-lg bg-linear-to-br from-blue-600 to-indigo-500 flex items-center justify-center">
        <Sparkles className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{secondary}</p>
        <p className="text-xl font-semibold text-foreground tabular-nums">
          {primary}
        </p>
      </div>
    </div>
  );
}
