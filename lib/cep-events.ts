import "server-only";
import { getRedis } from "@/lib/redis";

export type CepPackEventType = "pack.created" | "pack.updated" | "pack.deleted";

export type CepPackEventPayload = {
  type: CepPackEventType;
  id: string;
  name: string;
  pack_name: string;
  host: "AE" | "PR";
  version?: string | null;
  image_url?: string | null;
  visible?: boolean;
  ts: number;
  author_id: number;
};

export function cepEventsChannel(authorId: number): string {
  return `cep:events:${authorId}`;
}

/** Global fan-out for Spunkram extension releases (all connected CEP panels). */
export const CEP_EXTENSION_CHANNEL = "cep:extension";

export type CepExtensionUpdatePayload = {
  type: "extension.update";
  version: string;
  zxp_url: string;
  changelog?: string;
  channel: "stable" | "beta";
  published_at: string;
  ts: number;
};

/**
 * Fan-out pack lifecycle to CEP WebSocket subscribers via Redis.
 * Custom server.mjs subscribes and broadcasts to connected panels.
 */
export async function publishCepPackEvent(
  event: CepPackEventPayload,
): Promise<void> {
  try {
    const redis = getRedis();
    await redis.connect().catch(() => {});
    const channel = cepEventsChannel(event.author_id);
    await redis.publish(channel, JSON.stringify(event));
  } catch (err) {
    console.warn("[cep-events] publish failed", err);
  }
}

/** Notify all open CEP panels that a new ZXP is on the CDN. */
export async function publishCepExtensionUpdate(
  event: Omit<CepExtensionUpdatePayload, "type" | "ts"> & { ts?: number },
): Promise<void> {
  try {
    const redis = getRedis();
    await redis.connect().catch(() => {});
    const payload: CepExtensionUpdatePayload = {
      type: "extension.update",
      version: event.version,
      zxp_url: event.zxp_url,
      changelog: event.changelog || "",
      channel: event.channel,
      published_at: event.published_at,
      ts: event.ts ?? Date.now(),
    };
    await redis.publish(CEP_EXTENSION_CHANNEL, JSON.stringify(payload));
  } catch (err) {
    console.warn("[cep-events] extension publish failed", err);
  }
}

export function packSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "pack";
}
