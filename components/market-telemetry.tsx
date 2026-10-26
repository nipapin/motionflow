"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { analyticsPublicPath, heatWidth, type HeatCell } from "@/lib/market-analytics-shared";
import { bindMarketTelemetry } from "@/lib/market-telemetry-client";

const PRIVATE = "input,textarea,select,[contenteditable],[data-heatmap-ignore],[role=dialog]";
/** No React state on interaction. Pointer events only update a reference; work is sampled at 4 Hz. */
export function MarketTelemetry({ enabled, heatRate, layout }: { enabled: boolean; heatRate: number; layout: string }) {
  const path = usePathname();
  useEffect(() => {
    const privacy = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (!enabled || !analyticsPublicPath(path) || window.top !== window || privacy.globalPrivacyControl || navigator.doNotTrack === "1") {
      bindMarketTelemetry(null); return;
    }
    let visit = crypto.randomUUID(), width = window.innerWidth, bucket = heatWidth(width), scroll = 0;
    let height = Math.max(document.documentElement.scrollHeight, innerHeight), nextGeometry = 0;
    const sampled = Math.random() < heatRate;
    let pointer: { x: number; y: number; target: EventTarget | null; at: number } | null = null;
    let lastMove = "", lastDwell = 0, stopped = false;
    let visitReported = false, reportedScroll = -1;
    const cells = new Map<string, HeatCell>();
    const routeItem = /\/(?:items?)\/([1-9]\d*)$/.exec(path);
    let events: { id: string; action: "view" | "select"; itemId?: number }[] = [{ id: crypto.randomUUID(), action: "view", ...(routeItem ? { itemId: Number(routeItem[1]) } : {}) }];
    const add = (kind: HeatCell["kind"], x: number, y: number, weight: number) => {
      const gx = Math.max(0, Math.min(39, Math.floor(x / width * 40)));
      const gy = Math.max(0, Math.min(199, Math.floor(y / height * 200)));
      const key = `${kind}:${gx}:${gy}`;
      const previous = cells.get(key);
      if (previous) previous.weight = Math.min(15000, previous.weight + weight);
      else if (cells.size < 192) cells.set(key, { kind, x: gx, y: gy, weight });
    };
    const allowedTarget = (target: EventTarget | null) => target instanceof Element && !target.closest(PRIVATE);
    const flush = () => {
      if (stopped || (!events.length && !cells.size && (!sampled || (visitReported && scroll === reportedScroll)))) return;
      const body = JSON.stringify({ id: crypto.randomUUID(), visit, path, width, layout, heat: sampled,
        scroll, cells: [...cells.values()], events });
      cells.clear(); events = [];
      visitReported = true; reportedScroll = scroll;
      // Bounded best-effort delivery. No retries or growing queues on slow/offline connections.
      const blob = new Blob([body], { type: "application/json" });
      if (!navigator.sendBeacon?.("/api/analytics/collect", blob)) {
        void fetch("/api/analytics/collect", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true, credentials: "same-origin" }).catch(() => {});
      }
    };
    bindMarketTelemetry(event => {
      if (events.length < 16) events.push({ ...event, id: crypto.randomUUID() });
    });
    const move = (event: PointerEvent) => { if (event.pointerType === "mouse") pointer = { x: event.clientX, y: event.clientY, target: event.target, at: performance.now() }; };
    const leave = () => { pointer = null; lastDwell = 0; };
    const click = (event: MouseEvent) => {
      if (document.visibilityState === "visible" && allowedTarget(event.target)) add("click", event.clientX, event.clientY + window.scrollY, 1);
    };
    const sample = () => {
      if (document.visibilityState !== "visible" || !document.hasFocus()) { lastDwell = 0; return; }
      const now = performance.now();
      if (now > nextGeometry) {
        const resized = heatWidth(innerWidth) !== bucket;
        if (resized) { flush(); visit = crypto.randomUUID(); width = innerWidth; bucket = heatWidth(width); scroll = 0; lastMove = ""; visitReported = false; reportedScroll = -1; }
        height = Math.max(document.documentElement.scrollHeight, innerHeight); nextGeometry = now + 1000;
        scroll = Math.max(scroll, Math.min(100, Math.round((scrollY + innerHeight) / height * 100)));
      }
      if (!pointer || now - pointer.at > 5000 || !allowedTarget(pointer.target)) { lastDwell = 0; return; }
      const x = pointer.x, y = pointer.y + scrollY;
      const key = `${Math.round(x / 8)}:${Math.round(y / 8)}`;
      if (key !== lastMove) { add("move", x, y, 1); lastMove = key; }
      if (lastDwell) add("dwell", x, y, Math.min(500, Math.round(now - lastDwell)));
      lastDwell = now;
    };
    if (sampled) {
      document.addEventListener("pointermove", move, { passive: true });
      document.addEventListener("click", click, { passive: true });
      document.addEventListener("pointerleave", leave, { passive: true });
    }
    const sampler = sampled ? window.setInterval(sample, 250) : null;
    const schedule = () => { if ("requestIdleCallback" in window) window.requestIdleCallback(flush, { timeout: 2000 }); else flush(); };
    const sender = window.setInterval(schedule, 15000);
    const hidden = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", flush);
    const initial = window.setTimeout(schedule, 1000);
    return () => {
      flush(); stopped = true; bindMarketTelemetry(null); clearTimeout(initial); clearInterval(sender);
      if (sampler !== null) clearInterval(sampler);
      document.removeEventListener("pointermove", move); document.removeEventListener("click", click); document.removeEventListener("pointerleave", leave);
      document.removeEventListener("visibilitychange", hidden); window.removeEventListener("pagehide", flush);
    };
  }, [path, enabled, heatRate, layout]);
  return null;
}
