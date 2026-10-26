"use client";
type Intent = { action: "view" | "select"; itemId: number };
let sink: ((event: Intent) => void) | null = null;
let blocked = false;
const pending: Intent[] = [];
export function trackMarketItem(action: Intent["action"], itemId: number): void {
  if (blocked || typeof window === "undefined" || !Number.isSafeInteger(itemId) || itemId <= 0) return;
  if (sink) sink({ action, itemId });
  else if (pending.length < 16) pending.push({ action, itemId });
}
export function bindMarketTelemetry(next: ((event: Intent) => void) | null): void {
  sink = next;
  blocked = next === null;
  if (next) for (const event of pending.splice(0)) next(event);
  else pending.length = 0;
}
