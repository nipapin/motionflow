"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/components/auth-provider";
import { SignInModal } from "@/components/sign-in-modal";

type FavoritesContextValue = {
  ids: Set<number>;
  loading: boolean;
  toggle: (itemId: number) => Promise<boolean>;
  isFav: (itemId: number) => boolean;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [ids, setIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      setIds(new Set());
      return;
    }
    setLoading(true);
    fetch("/api/favorites", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { ids: number[] }) => setIds(new Set(d.ids)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  const toggle = useCallback(
    async (itemId: number): Promise<boolean> => {
      if (!user) {
        setSignInOpen(true);
        return false;
      }

      const was = ids.has(itemId);
      setIds((prev) => {
        const next = new Set(prev);
        if (was) next.delete(itemId);
        else next.add(itemId);
        return next;
      });

      try {
        const r = await fetch("/api/favorites", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId }),
        });
        const data = (await r.json()) as { favorited?: boolean; error?: string };
        if (!r.ok) {
          setIds((prev) => {
            const next = new Set(prev);
            if (was) next.add(itemId);
            else next.delete(itemId);
            return next;
          });
          return was;
        }
        return data.favorited ?? !was;
      } catch {
        setIds((prev) => {
          const next = new Set(prev);
          if (was) next.add(itemId);
          else next.delete(itemId);
          return next;
        });
        return was;
      }
    },
    [ids, user],
  );

  const isFav = useCallback((itemId: number) => ids.has(itemId), [ids]);

  const value = useMemo<FavoritesContextValue>(
    () => ({ ids, loading, toggle, isFav }),
    [ids, loading, toggle, isFav],
  );

  return (
    <FavoritesContext.Provider value={value}>
      {children}
      <SignInModal
        open={signInOpen}
        onOpenChange={setSignInOpen}
        onAuthSuccess={() => setSignInOpen(false)}
      />
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFavorites must be used within FavoritesProvider");
  return ctx;
}
