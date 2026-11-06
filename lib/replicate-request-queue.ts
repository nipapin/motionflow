import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { aiAccountForUser, type AiUsageIdentity } from "@/lib/ai-usage-shared";
import { getRedis } from "@/lib/redis";

type Lane = "create" | "other";

function setting(account: string, name: string, fallback: number, maximum: number): number {
  const raw = process.env[`REPLICATE_QUEUE_${account.toUpperCase()}_${name}`]
    ?? process.env[`REPLICATE_QUEUE_${name}`];
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 && value <= maximum ? value : fallback;
}

// Redis time and an atomic sequence give all server processes the same FIFO order.
// Waiting entries and active leases expire even if their server process dies.
const ACQUIRE = `
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local id = ARGV[1]
local expired = redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', now)
for _, member in ipairs(expired) do
  redis.call('ZREM', KEYS[1], member)
  redis.call('ZREM', KEYS[2], member)
end
redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', now)

if redis.call('ZSCORE', KEYS[3], id) then return {1, 0} end
if ARGV[2] == '1' then
  if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) then return {-1, 1000} end
  local sequence = redis.call('HINCRBY', KEYS[4], 'sequence', 1)
  redis.call('ZADD', KEYS[1], sequence, id)
  redis.call('ZADD', KEYS[2], now + tonumber(ARGV[4]), id)
elseif not redis.call('ZSCORE', KEYS[1], id) then
  return {-2, 1000}
end

for i = 1, 4 do redis.call('PEXPIRE', KEYS[i], ARGV[8]) end
local next_start = tonumber(redis.call('HGET', KEYS[4], 'next_start') or '0')
local cooldown = tonumber(redis.call('GET', KEYS[5]) or '0')
local ready_at = math.max(next_start, cooldown)
local rank = redis.call('ZRANK', KEYS[1], id)
if rank == 0 and now >= ready_at and redis.call('ZCARD', KEYS[3]) < tonumber(ARGV[5]) then
  redis.call('ZREM', KEYS[1], id)
  redis.call('ZREM', KEYS[2], id)
  redis.call('ZADD', KEYS[3], now + tonumber(ARGV[6]), id)
  redis.call('PEXPIRE', KEYS[3], ARGV[8])
  redis.call('HSET', KEYS[4], 'next_start', now + tonumber(ARGV[7]))
  return {1, 0}
end
local delay = math.max(50, ready_at - now, rank * tonumber(ARGV[7]))
if redis.call('ZCARD', KEYS[3]) >= tonumber(ARGV[5]) then delay = math.max(delay, 250) end
return {0, math.min(delay, 1000)}
`;

const RELEASE = `
for i = 1, 3 do redis.call('ZREM', KEYS[i], ARGV[1]) end
return 1
`;

// A provider throttle pauses both lanes for this credential, across all processes.
const COOLDOWN = `
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local until_at = math.max(tonumber(redis.call('GET', KEYS[1]) or '0'), now + tonumber(ARGV[1]))
redis.call('SET', KEYS[1], until_at, 'PX', until_at - now + 60000)
return 1
`;

function unavailable(code: string, detail: string): Response {
  // A local admission failure is not a provider 429: the SDK must not retry a POST.
  return Response.json({ code, detail }, { status: 503, headers: { "Retry-After": "5" } });
}

async function retryDelay(response: Response): Promise<number> {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
    if (Number.isFinite(ms)) return Math.min(86_400_000, Math.max(1000, ms));
  }
  try {
    const body = await response.clone().json() as { detail?: unknown };
    if (typeof body.detail === "string") {
      const match = body.detail.match(/(?:resets? in|retry after|retry in)\s*~?\s*(\d+(?:\.\d+)?)\s*(milliseconds?|ms|minutes?|m|seconds?|s)?/i);
      if (match) {
        const unit = match[2]?.toLowerCase() ?? "s";
        const multiplier = unit === "ms" || unit.startsWith("millisecond") ? 1
          : unit === "m" || unit.startsWith("minute") ? 60_000 : 1000;
        return Math.min(86_400_000, Math.max(1000, Number(match[1]) * multiplier));
      }
    }
  } catch { /* Missing or non-JSON throttle details use the conservative fallback. */ }
  return 60_000;
}

/**
 * Bounded outgoing API queues per author credential, shared through Redis.
 * This schedules HTTP requests, not durable background generation jobs.
 * Replicate's SDK owns retries; each retry must acquire a new queue slot.
 */
export async function queuedReplicateFetch(
  user: AiUsageIdentity,
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): Promise<Response> {
  const request = input instanceof Request ? input : undefined;
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  // FileOutput also uses this fetch for delivery/CDN downloads, which must stream normally.
  if (url.origin !== "https://api.replicate.com" || !url.pathname.startsWith("/v1/")) {
    return fetch(input, init);
  }

  const authorization = new Headers(init?.headers ?? request?.headers).get("authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return unavailable("REPLICATE_QUEUE_NO_TOKEN", "The AI service is not configured.");
  const account = aiAccountForUser(user);
  const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
  const lane: Lane = method === "POST"
    && /^\/v1\/(?:models\/[^/]+\/[^/]+\/|deployments\/[^/]+\/[^/]+\/)?predictions\/?$/.test(url.pathname)
    ? "create" : "other";
  const prefix = lane.toUpperCase();
  const concurrency = setting(account, `${prefix}_CONCURRENCY`, lane === "create" ? 8 : 16, 128);
  const interval = setting(account, `${prefix}_INTERVAL_MS`, lane === "create" ? 250 : 50, 60_000);
  const maxPending = setting(account, "MAX_PENDING", 200, 2000);
  const waitTimeout = setting(account, "WAIT_TIMEOUT_MS", 180_000, 900_000);
  const requestTimeout = setting(account, "REQUEST_TIMEOUT_MS", 90_000, 300_000);
  // Tokens and prompts never enter Redis. Reused credentials share the same budget.
  const fingerprint = createHash("sha256").update(token).digest("hex");
  const base = `mf:replicate:queue:{${fingerprint}}`;
  const queue = `${base}:${lane}`;
  const keys = [`${queue}:waiting`, `${queue}:deadlines`, `${queue}:active`, `${queue}:state`, `${base}:cooldown`];
  const id = randomUUID();
  const redis = getRedis();
  const signal = init?.signal !== undefined ? init.signal : request?.signal;
  signal?.throwIfAborted();
  const waitingSignal = AbortSignal.any([
    ...(signal ? [signal] : []), AbortSignal.timeout(waitTimeout),
  ]);

  try {
    let enqueue = true;
    try {
      while (true) {
        waitingSignal.throwIfAborted();
        const raw = await redis.eval(ACQUIRE, keys.length, ...keys, id, enqueue ? "1" : "0",
          maxPending, waitTimeout, concurrency, requestTimeout + 30_000, interval,
          waitTimeout + requestTimeout + 60_000);
        if (!Array.isArray(raw) || raw.length !== 2) throw new Error("Invalid queue reply");
        const status = Number(raw[0]);
        if (status === 1) break;
        if (status === -1) return unavailable("REPLICATE_QUEUE_FULL", "The AI request queue is full. Please try again shortly.");
        if (status === -2) return unavailable("REPLICATE_QUEUE_TIMEOUT", "The AI request queue timed out. Please try again shortly.");
        if (status !== 0 || !Number.isFinite(Number(raw[1]))) throw new Error("Invalid queue status");
        enqueue = false;
        await sleep(Number(raw[1]) + Math.floor(Math.random() * 25), undefined, { signal: waitingSignal });
      }
      waitingSignal.throwIfAborted();
    } catch {
      signal?.throwIfAborted();
      if (waitingSignal.aborted) {
        return unavailable("REPLICATE_QUEUE_TIMEOUT", "The AI request queue timed out. Please try again shortly.");
      }
      // Never bypass a failed distributed queue and send an uncontrolled burst.
      console.error("[replicate-queue] Redis scheduling is unavailable", { account, lane });
      return unavailable("REPLICATE_QUEUE_UNAVAILABLE", "The AI request queue is temporarily unavailable. Please try again shortly.");
    }

    const response = await fetch(input, {
      ...init,
      signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(requestTimeout)]),
    });
    if (response.status === 429) {
      const delay = await retryDelay(response);
      try {
        await redis.eval(COOLDOWN, 1, keys[4], delay);
      } catch {
        // Hold this attempt until the provider reset even if Redis failed mid-request.
        console.error("[replicate-queue] Could not share the provider cooldown", { account, lane });
        await sleep(delay, undefined, { signal: signal ?? undefined });
      }
    }
    return response;
  } finally {
    try { await redis.eval(RELEASE, 3, ...keys.slice(0, 3), id); }
    catch { console.error("[replicate-queue] Queue cleanup deferred to lease expiry", { account, lane }); }
  }
}
