"use client";

import { useSyncExternalStore } from "react";
import { marketplaceSalePhase, nextMarketplaceSaleTransition } from "@/lib/marketplace-black-friday";

function subscribe(listener: () => void) {
  let timer: number | undefined;
  function schedule() {
    const now = Date.now();
    const next = nextMarketplaceSaleTransition(now);
    if (next === undefined) return;
    timer = window.setTimeout(() => {
      listener();
      schedule();
    }, Math.min(next - now, 2_147_483_647));
  }

  schedule();
  return () => window.clearTimeout(timer);
}

function subscribeHidden() {
  return () => {};
}

export function useMarketplaceSalePhase(initialTime: number | null) {
  function readPhase() {
    return initialTime === null ? "hidden" : marketplaceSalePhase(Date.now());
  }

  return useSyncExternalStore(initialTime === null ? subscribeHidden : subscribe, readPhase,
    () => initialTime === null ? "hidden" : marketplaceSalePhase(initialTime));
}
