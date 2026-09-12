import "server-only";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { resolveCepBearerUser, type CepBearerUser } from "@/lib/cep-auth";
import { getRedis } from "@/lib/redis";

export type StockCaller = {
  id: number;
  email: string;
  source: "cep-bearer" | "session" | "anonymous";
  deviceId?: number;
  ipHash?: string;
};

function clientIp(req: NextRequest): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 24);
}

function anonymousCaller(req: NextRequest): StockCaller {
  return {
    id: 0,
    email: "",
    source: "anonymous",
    ipHash: hashIp(clientIp(req)),
  };
}

function rateLimitKey(caller: StockCaller): string {
  if (caller.source === "anonymous") {
    return `mf:stock:anon:${caller.ipHash ?? "unknown"}`;
  }
  return `mf:stock:${caller.id}`;
}

/**
 * CEP Bearer or web session. Browse routes may fall back to an IP-based anonymous caller.
 */
export async function resolveStockCaller(
  req: NextRequest,
): Promise<StockCaller | null> {
  const bearer = await resolveCepBearerUser(req.headers.get("authorization"));
  if (bearer) {
    return {
      id: bearer.id,
      email: bearer.email,
      source: "cep-bearer",
      deviceId: bearer.deviceId,
    };
  }
  const session = await getSessionUser();
  if (session) {
    return {
      id: session.id,
      email: session.email,
      source: "session",
    };
  }
  return null;
}

export function unauthorizedStockResponse(): NextResponse {
  return NextResponse.json(
    { error: "UNAUTHORIZED", message: "Please sign in to use stock media." },
    { status: 401 },
  );
}

export function rateLimitedStockResponse(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    { error: "RATE_LIMITED", message: "Too many stock requests. Try again shortly." },
    {
      status: 429,
      headers: { "Retry-After": String(Math.max(1, retryAfterSec)) },
    },
  );
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function rateLimitDisabled(): boolean {
  const v = process.env.MOTIONFLOW_STOCK_RATE_LIMIT?.trim().toLowerCase();
  return v === "0" || v === "false" || v === "off";
}

const LUA = `
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
      if until_expire > 0 then retry_ms = until_expire else retry_ms = 1000 end
    end
  end
  return {0, retry_ms}
end
redis.call("ZADD", key, now, member)
redis.call("PEXPIRE", key, ttl_ms)
return {1, 0}
`;

/** Sliding window: default 60 ops/min for signed-in users, 40/min per IP for guests. */
export async function checkStockRateLimit(
  caller: StockCaller,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  if (rateLimitDisabled()) return { ok: true };
  const max =
    caller.source === "anonymous"
      ? envInt("MOTIONFLOW_STOCK_ANON_MAX_PER_WINDOW", 40)
      : envInt("MOTIONFLOW_STOCK_MAX_PER_WINDOW", 60);
  const windowMs = envInt("MOTIONFLOW_STOCK_WINDOW_MS", 60_000);
  try {
    const redis = getRedis();
    await redis.connect().catch(() => {});
    const key = rateLimitKey(caller);
    const now = Date.now();
    const member = `${now}:${crypto.randomBytes(8).toString("hex")}`;
    const raw = await redis.eval(
      LUA,
      1,
      key,
      String(now),
      String(windowMs),
      String(max),
      member,
      String(windowMs + 10_000),
    );
    if (!Array.isArray(raw) || raw.length < 2) return { ok: true };
    if (Number(raw[0]) === 1) return { ok: true };
    return { ok: false, retryAfterSec: Math.ceil(Number(raw[1]) / 1000) || 60 };
  } catch (err) {
    console.warn("[stock-rate-limit] redis error, fail-open", err);
    return { ok: true };
  }
}

/** Guard for stock routes: auth + rate limit. Returns Response if blocked. */
export async function guardStockRequest(
  req: NextRequest,
  opts?: { allowAnonymous?: boolean },
): Promise<{ caller: StockCaller } | { response: NextResponse }> {
  const caller = (await resolveStockCaller(req)) ?? (opts?.allowAnonymous ? anonymousCaller(req) : null);
  if (!caller) return { response: unauthorizedStockResponse() };
  const rl = await checkStockRateLimit(caller);
  if (!rl.ok) return { response: rateLimitedStockResponse(rl.retryAfterSec) };
  return { caller };
}

export type { CepBearerUser };
