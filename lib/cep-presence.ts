import "server-only";

import { getRedis } from "@/lib/redis";

const PRESENCE_TTL_SEC = 90;

export function cepPresenceKey(deviceId: number): string {
  return `cep:presence:dev:${deviceId}`;
}

/** Mark a CEP device as online (WS connected). Fire-and-forget safe. */
export async function setCepDeviceOnline(deviceId: number): Promise<void> {
  if (!Number.isFinite(deviceId) || deviceId <= 0) return;
  try {
    const redis = getRedis();
    await redis.connect().catch(() => {});
    await redis.set(cepPresenceKey(deviceId), "1", "EX", PRESENCE_TTL_SEC);
  } catch (err) {
    console.warn("[cep-presence] set failed", err);
  }
}

/** Refresh TTL while the socket stays alive. */
export async function touchCepDeviceOnline(deviceId: number): Promise<void> {
  await setCepDeviceOnline(deviceId);
}

export async function clearCepDeviceOnline(deviceId: number): Promise<void> {
  if (!Number.isFinite(deviceId) || deviceId <= 0) return;
  try {
    const redis = getRedis();
    await redis.connect().catch(() => {});
    await redis.del(cepPresenceKey(deviceId));
  } catch (err) {
    console.warn("[cep-presence] clear failed", err);
  }
}

/** Batch online lookup for admin lists. Missing/Redis-down → offline. */
export async function getCepDevicesOnlineMap(
  deviceIds: number[],
): Promise<Map<number, boolean>> {
  const out = new Map<number, boolean>();
  const ids = [
    ...new Set(deviceIds.filter((n) => Number.isInteger(n) && n > 0)),
  ];
  for (const id of ids) out.set(id, false);
  if (ids.length === 0) return out;
  try {
    const redis = getRedis();
    await redis.connect().catch(() => {});
    const pipeline = redis.pipeline();
    for (const id of ids) pipeline.exists(cepPresenceKey(id));
    const results = await pipeline.exec();
    if (!results) return out;
    results.forEach((entry, i) => {
      const id = ids[i]!;
      const [err, val] = entry;
      if (!err && Number(val) > 0) out.set(id, true);
    });
  } catch {
    /* treat as offline */
  }
  return out;
}

export const CEP_PRESENCE_TTL_SEC = PRESENCE_TTL_SEC;
