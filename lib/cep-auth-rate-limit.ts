import crypto from "node:crypto";
import "server-only";
import { getRedis } from "@/lib/redis";

/**
 * Sliding-window rate limits for CEP device-code auth endpoints.
 * Reuses the same Redis ZSET Lua pattern as marketplace downloads.
 */

export type CepAuthRateResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number };

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function rateLimitDisabled(): boolean {
  const v = process.env.CEP_AUTH_RATE_LIMIT?.trim().toLowerCase();
  return v === "0" || v === "false" || v === "off";
}

function failClosedOnRedisError(): boolean {
  const v = process.env.CEP_AUTH_RATELIMIT_STRICT?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** POST /auth/device — max starts per IP (default 10 / 15 min). */
function deviceMax(): number {
  return envInt("CEP_AUTH_DEVICE_MAX_PER_WINDOW", 10);
}
function deviceWindowMs(): number {
  return envInt("CEP_AUTH_DEVICE_WINDOW_MS", 15 * 60_000);
}

/** POST /auth/token — max polls per IP (default 120 / 5 min ≈ one full login + headroom). */
function tokenMax(): number {
  return envInt("CEP_AUTH_TOKEN_MAX_PER_WINDOW", 120);
}
function tokenWindowMs(): number {
  return envInt("CEP_AUTH_TOKEN_WINDOW_MS", 5 * 60_000);
}

const CHECK_AND_CONSUME_LUA = `
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

async function checkLimit(
  key: string,
  max: number,
  windowMs: number,
): Promise<CepAuthRateResult> {
  if (rateLimitDisabled()) return { ok: true };

  try {
    const redis = getRedis();
    await redis.connect().catch(() => {});

    const now = Date.now();
    const member = `${now}:${crypto.randomBytes(8).toString("hex")}`;
    const raw = await redis.eval(
      CHECK_AND_CONSUME_LUA,
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
    if (allowed === 1) return { ok: true };
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
    console.error("[cep-auth-rate-limit]", e);
    if (failClosedOnRedisError()) {
      return { ok: false, retryAfterSec: Math.ceil(windowMs / 1000) };
    }
    return { ok: true };
  }
}

function ipKeyPart(ip: string | null | undefined): string {
  const t = (ip ?? "unknown").trim().slice(0, 64) || "unknown";
  return t.replace(/[^a-zA-Z0-9:._-]/g, "_");
}

export async function checkCepAuthDeviceRateLimit(
  ip: string | null | undefined,
): Promise<CepAuthRateResult> {
  return checkLimit(
    `mf:cep-auth:device:${ipKeyPart(ip)}`,
    deviceMax(),
    deviceWindowMs(),
  );
}

export async function checkCepAuthTokenRateLimit(
  ip: string | null | undefined,
): Promise<CepAuthRateResult> {
  return checkLimit(
    `mf:cep-auth:token:${ipKeyPart(ip)}`,
    tokenMax(),
    tokenWindowMs(),
  );
}
