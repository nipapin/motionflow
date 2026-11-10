import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getRedis } from "@/lib/redis";

/**
 * Short-lived server receipt proving captions ASR was already billed.
 * Chapters accepts this instead of a client-spoofable `meteredWithCaptions` flag.
 *
 * Token format: `base64url(payloadJson).base64url(hmacSha256)`
 */

const DEFAULT_TTL_SEC = 15 * 60;

function receiptSecret(): string | null {
  const s =
    process.env.CAPTIONS_CHAPTERS_RECEIPT_SECRET?.trim() ||
    process.env.CEP_AUTH_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    process.env.APP_KEY?.trim();
  return s || null;
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b.toString("base64url");
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

export type CaptionsChaptersReceiptPayload = {
  /** Unique server-issued job identity, atomically claimed once in Redis. */
  jti: string;
  uid: number | string;
  /** Metered duration used for the captions charge (seconds). */
  dur: number;
  /** Cost already charged on captions. */
  cost: number;
  exp: number;
};

export function issueCaptionsChaptersReceipt(opts: {
  userId: number | string;
  durationSeconds: number;
  cost: number;
  ttlSec?: number;
}): string | undefined {
  const secret = receiptSecret();
  if (!secret) {
    console.error(
      "[captions] no AUTH_SECRET / CAPTIONS_CHAPTERS_RECEIPT_SECRET — chapters receipt skipped",
    );
    return undefined;
  }
  const payload: CaptionsChaptersReceiptPayload = {
    jti: randomBytes(16).toString("hex"),
    uid: opts.userId,
    dur: Math.max(0, opts.durationSeconds),
    cost: Math.max(0, Math.floor(opts.cost)),
    exp: Math.floor(Date.now() / 1000) + (opts.ttlSec ?? DEFAULT_TTL_SEC),
  };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyCaptionsChaptersReceipt(
  token: unknown,
  userId: number | string,
): { ok: true; payload: CaptionsChaptersReceiptPayload } | { ok: false } {
  if (typeof token !== "string" || token.split(".").length !== 2) return { ok: false };
  const [body, sig] = token.split(".");
  if (!body || !sig) return { ok: false };

  const secret = receiptSecret();
  if (!secret) return { ok: false };

  let expected: Buffer;
  try {
    expected = createHmac("sha256", secret).update(body).digest();
  } catch {
    return { ok: false };
  }

  let got: Buffer;
  try {
    got = fromB64url(sig);
  } catch {
    return { ok: false };
  }
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
    return { ok: false };
  }

  let payload: CaptionsChaptersReceiptPayload;
  try {
    payload = JSON.parse(fromB64url(body).toString("utf8")) as CaptionsChaptersReceiptPayload;
  } catch {
    return { ok: false };
  }

  if (
    typeof payload.jti !== "string" || !/^[a-f0-9]{32}$/.test(payload.jti) ||
    (typeof payload.uid !== "number" && typeof payload.uid !== "string") ||
    payload.uid !== userId ||
    !Number.isFinite(payload.exp) ||
    payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    return { ok: false };
  }

  return { ok: true, payload };
}

/** A signature proves issuance; a shared atomic claim prevents replay across workers.
 * Redis failures throw so a free follow-up cannot silently become an extra charge.
 */
export async function claimCaptionsChaptersReceipt(
  token: unknown,
  userId: number | string,
  operationId?: string,
): Promise<{ ok: true; payload: CaptionsChaptersReceiptPayload } | { ok: false }> {
  const verified = verifyCaptionsChaptersReceipt(token, userId);
  if (!verified.ok) return verified;
  const redis = getRedis();
  await redis.connect().catch(() => {});
  const ttl = Math.max(1, verified.payload.exp - Math.floor(Date.now() / 1000));
  const key = `captions:chapters-receipt:${verified.payload.jti}`;
  const claim = operationId ? `${userId}:${operationId}` : "1";
  const claimed = await redis.set(key, claim, "EX", ttl, "NX");
  if (claimed === "OK") return verified;
  // A failed Odin operation can retry its own free follow-up; another operation cannot replay it.
  return operationId && await redis.get(key) === claim ? verified : { ok: false };
}
