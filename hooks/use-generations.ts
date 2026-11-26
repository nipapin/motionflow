"use client";

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { AiWorkspaceActiveContext } from "@/components/ai-workspace-context";
import type { MotionflowGenerationPlan } from "@/lib/subscriptions";

export interface GenerationStatus {
  used: number;
  limit: number;
  /** Billing-period cap including manual subscription_adjustment (defaults to `limit` if omitted). */
  effective_limit: number;
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
  const limit = Number(data.limit ?? 0);
  const effectiveRaw = data.effective_limit ?? data.limit ?? 0;
  const effective_limit = Number(effectiveRaw);
  return {
    used: Number(data.used ?? 0),
    limit,
    effective_limit,
    remaining,
    hasSubscription: Boolean(data.hasSubscription),
    plan: parseGenerationPlan(data.plan),
    subscription_generations_left,
    extra_generations_left,
    total_generations_left,
  };
}

const GENERATIONS_UPDATED_EVENT = "motionflow:generations-updated";
type GenerationUpdate = { userId: number; status: GenerationStatus };

export function useGenerations(): UseGenerationsResult {
  const { user } = useAuth();
  const workspaceActive = useContext(AiWorkspaceActiveContext);
  const [snapshot, setSnapshot] = useState<GenerationUpdate | null>(null);
  const status = snapshot?.userId === user?.id ? snapshot?.status ?? null : null;
  const currentUserId = useRef(user?.id);
  currentUserId.current = user?.id;
  const requestVersion = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(true);

  const refresh = useCallback(async () => {
    const userId = user?.id;
    const version = ++requestVersion.current;
    if (!userId) {
      setAuthenticated(false);
      setSnapshot(null);
      setLoading(false);
      return;
    }
    const isCurrent = () => currentUserId.current === userId && requestVersion.current === version;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/me/generations", {
        credentials: "include",
        cache: "no-store",
      });

      if (!isCurrent()) return;
      if (res.status === 401) {
        setAuthenticated(false);
        setSnapshot(null);
        return;
      }

      const data = (await res.json().catch(() => ({}))) as Partial<
        GenerationStatus
      > & { error?: string };

      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      if (!isCurrent()) return;
      const update = { userId, status: normalizeGenerationStatus(data) };
      setAuthenticated(true);
      setSnapshot(update);
      window.dispatchEvent(new CustomEvent<GenerationUpdate>(GENERATIONS_UPDATED_EVENT, { detail: update }));
    } catch (e) {
      if (isCurrent()) setError(e instanceof Error ? e.message : "Failed to load status");
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [user?.id]);

  /** Re-fetch when session appears/changes (e.g. after sign-in modal) so UI is not stuck logged-out. */
  useEffect(() => {
    if (workspaceActive) void refresh();
  }, [refresh, user?.id, workspaceActive]);

  // All tool instances and the sidebar share updates without polling or extra requests.
  useEffect(() => {
    const receive = (event: Event) => {
      const update = (event as CustomEvent<GenerationUpdate>).detail;
      if (!update || update.userId !== currentUserId.current) return;
      ++requestVersion.current;
      setSnapshot(update);
      setAuthenticated(true);
      setLoading(false);
      setError(null);
    };
    window.addEventListener(GENERATIONS_UPDATED_EVENT, receive);
    const onFocus = () => { if (workspaceActive && user?.id) void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener(GENERATIONS_UPDATED_EVENT, receive);
      window.removeEventListener("focus", onFocus);
    };
  }, [workspaceActive, user?.id, refresh]);

  const setStatus = useCallback((next: GenerationStatus) => {
    const userId = user?.id;
    if (!userId || currentUserId.current !== userId) return;
    const update = { userId, status: normalizeGenerationStatus(next) };
    setSnapshot(update);
    window.dispatchEvent(new CustomEvent<GenerationUpdate>(GENERATIONS_UPDATED_EVENT, { detail: update }));
  }, [user?.id]);

  return { status, loading, error, authenticated, refresh, setStatus };
}
