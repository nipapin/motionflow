"use client";

import { useCallback, useEffect, useState } from "react";

export interface GenerationStatus {
  used: number;
  limit: number;
  remaining: number;
  hasSubscription: boolean;
}

export type GenerationTool = "image" | "video" | "tts" | "stt";

export interface UseGenerationsResult {
  status: GenerationStatus | null;
  loading: boolean;
  error: string | null;
  authenticated: boolean;
  refresh: () => Promise<void>;
  /** Records one generation server-side. Returns the new status, or throws on failure. */
  consume: (tool: GenerationTool) => Promise<GenerationStatus>;
  /** Replace local status (used by routes that already debited server-side). */
  setStatus: (next: GenerationStatus) => void;
}

export function useGenerations(): UseGenerationsResult {
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
      setStatusState({
        used: Number(data.used ?? 0),
        limit: Number(data.limit ?? 0),
        remaining: Number(data.remaining ?? 0),
        hasSubscription: Boolean(data.hasSubscription),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const consume = useCallback(
    async (tool: GenerationTool): Promise<GenerationStatus> => {
      const res = await fetch("/api/me/generations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool }),
      });

      const data = (await res.json().catch(() => ({}))) as Partial<
        GenerationStatus
      > & { error?: string };

      if (!res.ok) {
        if (
          typeof data.used === "number" &&
          typeof data.limit === "number" &&
          typeof data.remaining === "number"
        ) {
          setStatusState({
            used: data.used,
            limit: data.limit,
            remaining: data.remaining,
            hasSubscription: Boolean(data.hasSubscription),
          });
        }
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const next: GenerationStatus = {
        used: Number(data.used ?? 0),
        limit: Number(data.limit ?? 0),
        remaining: Number(data.remaining ?? 0),
        hasSubscription: Boolean(data.hasSubscription),
      };
      setStatusState(next);
      return next;
    },
    [],
  );

  const setStatus = useCallback((next: GenerationStatus) => {
    setStatusState(next);
  }, []);

  return { status, loading, error, authenticated, refresh, consume, setStatus };
}
