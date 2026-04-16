import crypto from "node:crypto";
import { serialize, unserialize } from "php-serialize";
import { getRedis } from "@/lib/redis";
import { LARAVEL_COOKIE_NAME } from "./session";

const CIPHER = "aes-256-cbc";
const IV_LENGTH = 16;

const LOGIN_SESSION_KEY =
  "login_web_59ba36addc2b2f9401580f014c7f58ea4e30989d";

function getLaravelKey(): Buffer {
  const raw = process.env.APP_KEY;
  if (!raw) throw new Error("APP_KEY is required for Laravel session support");
  const key = raw.startsWith("base64:") ? raw.slice(7) : raw;
  return Buffer.from(key, "base64");
}

function redisSessionKey(sessionId: string): string {
  const globalPrefix = process.env.LARAVEL_REDIS_PREFIX ?? "motionflow_database_";
  const cachePrefix = process.env.LARAVEL_CACHE_PREFIX ?? "motionflow_cache_:";
  return `${globalPrefix}${cachePrefix}${sessionId}`;
}

// ─── Cookie-value prefix (CookieValuePrefix::create in Laravel) ──────────
function cookieValuePrefix(key: Buffer): string {
  return (
    crypto
      .createHmac("sha1", key)
      .update(LARAVEL_COOKIE_NAME + "v2")
      .digest("hex") + "|"
  );
}

// ─── AES-256-CBC decrypt (mirrors Illuminate\Encryption\Encrypter) ──────
function laravelDecrypt(payload: string, key: Buffer): string {
  const json = JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as {
    iv: string;
    value: string;
    mac: string;
  };

  const expectedMac = crypto
    .createHmac("sha256", key)
    .update(json.iv + json.value)
    .digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(expectedMac, "hex"), Buffer.from(json.mac, "hex"))) {
    throw new Error("MAC mismatch");
  }

  const iv = Buffer.from(json.iv, "base64");
  const value = Buffer.from(json.value, "base64");
  const decipher = crypto.createDecipheriv(CIPHER, key, iv);
  return Buffer.concat([decipher.update(value), decipher.final()]).toString("utf8");
}

// ─── AES-256-CBC encrypt (mirrors Illuminate\Encryption\Encrypter) ──────
function laravelEncrypt(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(CIPHER, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  const ivB64 = iv.toString("base64");
  const valueB64 = encrypted.toString("base64");
  const mac = crypto
    .createHmac("sha256", key)
    .update(ivB64 + valueB64)
    .digest("hex");

  return Buffer.from(
    JSON.stringify({ iv: ivB64, value: valueB64, mac, tag: "" }),
  ).toString("base64");
}

// ─── Public API ─────────────────────────────────────────────────────────

/** Decrypt a `motionflow_session` cookie value → Laravel session ID. */
export function decryptLaravelCookie(cookieValue: string): string | null {
  try {
    const key = getLaravelKey();
    const decrypted = laravelDecrypt(cookieValue, key);
    const prefix = cookieValuePrefix(key);
    if (!decrypted.startsWith(prefix)) return null;
    return decrypted.slice(prefix.length);
  } catch {
    return null;
  }
}

/** Encrypt a session ID into a value suitable for the `motionflow_session` cookie. */
export function encryptLaravelCookie(sessionId: string): string {
  const key = getLaravelKey();
  const prefixed = cookieValuePrefix(key) + sessionId;
  return laravelEncrypt(prefixed, key);
}

/** Read user ID from a Laravel Redis session. */
export async function readLaravelSessionUserId(sessionId: string): Promise<number | null> {
  try {
    const redis = getRedis();
    await redis.connect().catch(() => {});
    const raw = await redis.get(redisSessionKey(sessionId));
    if (!raw) return null;

    const outer = unserialize(raw);
    if (typeof outer !== "string") return null;
    const session = unserialize(outer) as Record<string, unknown>;
    const uid = session[LOGIN_SESSION_KEY];
    if (typeof uid === "number") return uid;
    if (typeof uid === "string") {
      const n = Number(uid);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    return null;
  } catch (e) {
    console.error("[laravel-session:read]", e);
    return null;
  }
}

/** Create a Laravel-compatible session in Redis and return the session ID. */
export async function createLaravelSession(userId: number): Promise<string | null> {
  try {
    const sessionId = crypto.randomBytes(20).toString("hex");
    const csrfToken = crypto.randomBytes(20).toString("hex");

    const attributes: Record<string, unknown> = {
      _token: csrfToken,
      [LOGIN_SESSION_KEY]: userId,
      _previous: { url: "" },
      _flash: { old: [], new: [] },
    };

    const inner = serialize(attributes);
    const outer = serialize(inner);

    const lifetimeMin = Number(process.env.SESSION_LIFETIME);
    const ttlSec =
      Number.isFinite(lifetimeMin) && lifetimeMin > 0
        ? lifetimeMin * 60
        : 43800 * 60;

    const redis = getRedis();
    await redis.connect().catch(() => {});
    await redis.setex(redisSessionKey(sessionId), ttlSec, outer);

    return sessionId;
  } catch (e) {
    console.error("[laravel-session:create]", e);
    return null;
  }
}

/** Delete a Laravel session from Redis. */
export async function deleteLaravelSession(sessionId: string): Promise<void> {
  try {
    const redis = getRedis();
    await redis.connect().catch(() => {});
    await redis.del(redisSessionKey(sessionId));
  } catch (e) {
    console.error("[laravel-session:delete]", e);
  }
}
