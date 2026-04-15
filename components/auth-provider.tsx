"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

export type AuthUser = {
  id: number;
  email: string;
  name: string;
  oauthPasswordOnly?: boolean;
  canChangePassword?: boolean;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  /**
   * Re-fetch session from `/api/auth/me`.
   * After email login/register, pass `fallbackIfNull` so a brief cookie delay does not flash logged-out UI.
   */
  refresh: (fallbackIfNull?: AuthUser) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  initialUser,
}: {
  children: ReactNode;
  initialUser?: AuthUser | null;
}) {
  const [user, setUser] = useState<AuthUser | null>(initialUser ?? null);
  const [loading, setLoading] = useState(!initialUser);

  const refresh = useCallback(async (fallbackIfNull?: AuthUser) => {
    try {
      const r = await fetch("/api/auth/me", { credentials: "include" });
      const d = (await r.json()) as { user: AuthUser | null };
      const next = d.user ?? fallbackIfNull ?? null;
      setUser(next);
    } catch {
      setUser(fallbackIfNull ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialUser) refresh();
  }, [initialUser, refresh]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("auth_error");
    if (!authError) return;

    const messages: Record<string, string> = {
      config: "Google sign-in is not configured. Contact support.",
      denied: "Google sign-in was cancelled.",
      state: "Session expired. Please try signing in again.",
      token: "Could not complete Google sign-in. Please try again.",
      profile: "Could not retrieve your Google profile.",
      email: "No email associated with this Google account.",
      create: "Could not create your account. Please try again.",
      server: "Server error during sign-in. Please try again later.",
    };

    toast.error(messages[authError] ?? "Sign-in failed. Please try again.");

    const url = new URL(window.location.href);
    url.searchParams.delete("auth_error");
    window.history.replaceState({}, "", url.pathname + url.search);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } finally {
      setUser(null);
      window.location.href = "/";
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
