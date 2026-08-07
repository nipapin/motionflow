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

export function packSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "pack";
}
