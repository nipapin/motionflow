"use client";

import { useSyncExternalStore } from "react";
import { BLACK_FRIDAY_END, BLACK_FRIDAY_START, getBlackFridayPhase } from "@/lib/premiere-gal-black-friday";
import { usePageSets } from "../page-sets-context";

function subscribe(listener: () => void) {
  if (getBlackFridayPhase(Date.now()) === "inactive") return () => {};
  const timer = window.setInterval(() => {
    listener();
    if (getBlackFridayPhase(Date.now()) === "inactive") window.clearInterval(timer);
  }, 1000);
  return () => window.clearInterval(timer);
}

function readClock() {
  return Math.floor(Date.now() / 1000) * 1000;
}

function readPhase() {
  return getBlackFridayPhase(Date.now());
}

export function useBlackFridayPhase() {
  const { initialTime } = usePageSets();
  return useSyncExternalStore(subscribe, readPhase, () => getBlackFridayPhase(initialTime));
}

export function useBlackFridayCountdown() {
  const { initialTime } = usePageSets();
  const now = useSyncExternalStore(subscribe, readClock, () => initialTime);
  const phase = getBlackFridayPhase(now);
  const countdownTime = Math.max(BLACK_FRIDAY_START, now);
  return { phase, secondsLeft: Math.max(0, Math.ceil((BLACK_FRIDAY_END - countdownTime) / 1000)) };
}
