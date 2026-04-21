"use client";

import { Sparkles } from "lucide-react";
import type { GenerationStatus } from "@/hooks/use-generations";

interface GenerationsBadgeProps {
  status: GenerationStatus | null;
  loading: boolean;
  authenticated: boolean;
}

export function GenerationsBadge({
  status,
  loading,
  authenticated,
}: GenerationsBadgeProps) {
  let primary: string;
  let secondary: string;

  if (!authenticated) {
    primary = "Sign in";
    secondary = "to use AI tools";
  } else if (loading || !status) {
    primary = "—";
    secondary = "Loading…";
  } else {
    primary = `${status.remaining} / ${status.limit}`;
    secondary = status.hasSubscription
      ? "AI plan generations"
      : "Free generations";
  }

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
