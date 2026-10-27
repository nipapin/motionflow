import "server-only";
import type { AiUsageIdentity } from "@/lib/ai-usage-shared";
import { saveAiPrediction } from "@/lib/ai-usage-store";

/** Attribute provider prediction IDs at creation, including each step of chained models. */
export function trackedReplicateFetch(user: AiUsageIdentity): (input: Request | string, init?: RequestInit) => Promise<Response> {
  const identity = { id: user.id, source: user.source, cepClient: user.cepClient };
  return async (input, init) => {
    const response = await fetch(input, init);
    const url = new URL(typeof input === "string" ? input : input.url);
    if (response.ok && url.hostname === "api.replicate.com" &&
        /^\/v1\/(?:models\/[^/]+\/[^/]+\/)?predictions(?:\/[a-zA-Z0-9_-]+(?:\/cancel)?)?$/.test(url.pathname)) {
      try { await saveAiPrediction(await response.clone().json(), identity); }
      catch { console.error("[ai-usage] Could not record Replicate prediction metadata"); }
    }
    return response;
  };
}
