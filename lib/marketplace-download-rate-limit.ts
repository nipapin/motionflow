import crypto from "node:crypto";
import "server-only";
import { getRedis } from "@/lib/redis";

export type MarketplaceDownloadRateResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number };

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function rateLimitDisabled(): boolean {
  const v = process.env.MOTIONFLOW_MARKETPLACE_DOWNLOAD_RATE_LIMIT?.trim().toLowerCase();
  return v === "0" || v === "false" || v === "off";
}

function failClosedOnRedisError(): boolean {
  const v =
    process.env.MOTIONFLOW_MARKETPLACE_DOWNLOAD_RATELIMIT_STRICT?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Max marketplace project downloads allowed per sliding window per user (default 10). */
export function marketplaceDownloadRateLimitMax(): number {
  return envInt("MOTIONFLOW_MARKETPLACE_DOWNLOAD_MAX_PER_WINDOW", 10);
}

/** Window length in ms (default 60_000). */
export function marketplaceDownloadRateLimitWindowMs(): number {
  return envInt("MOTIONFLOW_MARKETPLACE_DOWNLOAD_WINDOW_MS", 60_000);
}

const CHECK_AND_CONSUME_RATE_LIMIT_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local max_count = tonumber(ARGV[3])
local member = ARGV[4]
local ttl_ms = tonumber(ARGV[5])

local cutoff = now - window_ms
redis.call("ZREMRANGEBYSCORE", key, 0, cutoff)

local count = tonumber(redis.call("ZCARD", key))
if count >= max_count then
  local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
  local retry_ms = window_ms

  if oldest and oldest[2] then
    local oldest_score = tonumber(oldest[2])
    if oldest_score then
      local until_expire = (oldest_score + window_ms) - now
      if until_expire > 0 then
        retry_ms = until_expire
      else
        retry_ms = 1000
      end
    end
  end

  return {0, retry_ms}
end

redis.call("ZADD", key, now, member)
redis.call("PEXPIRE", key, ttl_ms)
return {1, 0}
`;

/**
 * Sliding-window rate limit for marketplace `/api/download/[itemId]` only.
 * Uses Redis sorted set (score = ms timestamp). Fail-open if Redis errors unless STRICT env is set.
 */
export async function checkMarketplaceDownloadRateLimit(
  userId: number,
): Promise<MarketplaceDownloadRateResult> {
  if (rateLimitDisabled()) return { ok: true };

  const max = marketplaceDownloadRateLimitMax();
  const windowMs = marketplaceDownloadRateLimitWindowMs();

  try {
    const redis = getRedis();
    await redis.connect().catch(() => {});

    const key = `mf:mkt-dl:${userId}`;
    const now = Date.now();
    const member = `${now}:${crypto.randomBytes(8).toString("hex")}`;
    const raw = await redis.eval(
      CHECK_AND_CONSUME_RATE_LIMIT_LUA,
      1,
      key,
      String(now),
      String(windowMs),
      String(max),
      member,
      String(windowMs + 10_000),
    );

    if (!Array.isArray(raw) || raw.length < 2) {
      throw new Error("unexpected rate-limit script reply");
    }

    const allowed = Number(raw[0]);
    const retryAfterMs = Number(raw[1]);

    if (allowed === 1) {
      return { ok: true };
    }
    if (allowed === 0) {
      return {
        ok: false,
        retryAfterSec: Math.max(
          1,
          Math.ceil((Number.isFinite(retryAfterMs) ? retryAfterMs : windowMs) / 1000),
        ),
      };
    }

    throw new Error("invalid rate-limit script status");
  } catch (e) {
    console.error("[marketplace-download-rate-limit]", e);
    if (failClosedOnRedisError()) {
      return {
        ok: false,
        retryAfterSec: Math.ceil(marketplaceDownloadRateLimitWindowMs() / 1000),
      };
    }
    return { ok: true };
  }
}
