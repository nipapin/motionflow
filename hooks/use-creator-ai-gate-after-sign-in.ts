"use client";

import { useEffect, useRef, useState } from "react";
import type { AuthUser } from "@/components/auth-provider";
import type { GenerationStatus } from "@/hooks/use-generations";

/**
 * When a guest taps Generate, we open sign-in. After a successful login, if they
 * still need Creator + AI, open the gate modal once—without keeping helper copy on screen.
 */
export function useCreatorAiGateAfterSignIn(
  user: AuthUser | null,
  generations: GenerationStatus | null,
  generationsLoading: boolean,
  signInOpen: boolean,
  setCreatorAiGateOpen: (open: boolean) => void,
  setCreatorAiVariant: (v: "subscribe" | "upgrade") => void,
) {
  const [pendingAfterSignIn, setPendingAfterSignIn] = useState(false);
  const prevSignInOpen = useRef(signInOpen);

  useEffect(() => {
    if (prevSignInOpen.current && !signInOpen && !user) {
      setPendingAfterSignIn(false);
    }
    prevSignInOpen.current = signInOpen;
  }, [signInOpen, user]);

  useEffect(() => {
    if (!pendingAfterSignIn || !user || generationsLoading) {
      return;
    }
    if (generations?.plan === "creator_ai") {
      setPendingAfterSignIn(false);
      return;
    }
    setCreatorAiVariant(
      generations?.plan === "creator" ? "upgrade" : "subscribe",
    );
    setCreatorAiGateOpen(true);
    setPendingAfterSignIn(false);
  }, [
    pendingAfterSignIn,
    user,
    generationsLoading,
    generations?.plan,
    setCreatorAiGateOpen,
    setCreatorAiVariant,
  ]);

  return { markGuestWantedGenerate: () => setPendingAfterSignIn(true) };
}
