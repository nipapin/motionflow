import "server-only";
import type { AiUsageIdentity } from "@/lib/ai-usage-shared";
import { saveAiPrediction } from "@/lib/ai-usage-store";

/** Attribute provider prediction IDs at creation, including each step of chained models. */
export function trackedReplicateFetch(user: AiUsageIdentity): typeof fetch {
  const identity = { id: user.id, source: user.source, cepClient: user.cepClient };
  return async (input, init) => {
    const response = await fetch(input, init);
    // Replicate passes a URL object, whereas Request exposes its address as .url.
    // All accounting work is best-effort: a successful provider response must
    // reach the caller even if address parsing, JSON decoding or storage fails.
    try {
      if (response.ok) {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        if (url.hostname === "api.replicate.com" &&
            /^\/v1\/(?:models\/[^/]+\/[^/]+\/)?predictions(?:\/[a-zA-Z0-9_-]+(?:\/cancel)?)?$/.test(url.pathname)) {
          await saveAiPrediction(await response.clone().json(), identity);
        }
      }
    } catch { console.error("[ai-usage] Could not record Replicate prediction metadata"); }
    return response;
  };
}
