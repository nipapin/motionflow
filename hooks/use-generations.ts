"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import type { MotionflowGenerationPlan } from "@/lib/subscriptions";

export interface GenerationStatus {
  used: number;
  limit: number;
  remaining: number;
  hasSubscription: boolean;
  plan: MotionflowGenerationPlan;
  subscription_generations_left: number;
  extra_generations_left: number;
  total_generations_left: number;
}

export interface UseGenerationsResult {
  status: GenerationStatus | null;
  loading: boolean;
  error: string | null;
  authenticated: boolean;
  refresh: () => Promise<void>;
  /** Replace local status (used by routes that already debited server-side). */
  setStatus: (next: GenerationStatus) => void;
}

function parseGenerationPlan(value: unknown): MotionflowGenerationPlan {
  if (value === "creator" || value === "creator_ai") return value;
  return "none";
}

export function normalizeGenerationStatus(
  data: Partial<GenerationStatus>,
): GenerationStatus {
  const remaining = Number(data.remaining ?? 0);
  const subscription_generations_left = Number(
    data.subscription_generations_left ?? remaining,
  );
  const extra_generations_left = Number(data.extra_generations_left ?? 0);
  const total_generations_left = Number(
    data.total_generations_left ??
      subscription_generations_left + extra_generations_left,
  );
  return {
    used: Number(data.used ?? 0),
    limit: Number(data.limit ?? 0),
    remaining,
    hasSubscription: Boolean(data.hasSubscription),
    plan: parseGenerationPlan(data.plan),
    subscription_generations_left,
    extra_generations_left,
    total_generations_left,
  };
}

export function useGenerations(): UseGenerationsResult {
  const { user } = useAuth();
  const [status, setStatusState] = useState<GenerationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/me/generations", {
        credentials: "include",
        cache: "no-store",
      });

      if (res.status === 401) {
        setAuthenticated(false);
        setStatusState(null);
        return;
      }

      const data = (await res.json().catch(() => ({}))) as Partial<
        GenerationStatus
      > & { error?: string };

      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      setAuthenticated(true);
      setStatusState(normalizeGenerationStatus(data));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load status");
    } finally {
      setLoading(false);
    }
  }, []);

  /** Re-fetch when session appears/changes (e.g. after sign-in modal) so UI is not stuck logged-out. */
  useEffect(() => {
    void refresh();
  }, [refresh, user?.id]);

  const setStatus = useCallback((next: GenerationStatus) => {
    setStatusState(next);
  }, []);

  return { status, loading, error, authenticated, refresh, setStatus };
}
