import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Short-lived server receipt proving captions ASR was already billed.
 * Chapters accepts this instead of a client-spoofable `meteredWithCaptions` flag.
 *
 * Token format: `base64url(payloadJson).base64url(hmacSha256)`
 */

const DEFAULT_TTL_SEC = 15 * 60;

function receiptSecret(): string {
  const s =
    process.env.CAPTIONS_CHAPTERS_RECEIPT_SECRET?.trim() ||
    process.env.CEP_AUTH_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim();
  if (!s) {
    throw new Error(
      "Missing CAPTIONS_CHAPTERS_RECEIPT_SECRET (or CEP_AUTH_SECRET / NEXTAUTH_SECRET) for chapters receipt signing",
    );
  }
  return s;
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

export type CaptionsChaptersReceiptPayload = {
  uid: number;
  /** Metered duration used for the captions charge (seconds). */
  dur: number;
  /** Cost already charged on captions. */
  cost: number;
  exp: number;
};

export function issueCaptionsChaptersReceipt(opts: {
  userId: number;
  durationSeconds: number;
  cost: number;
  ttlSec?: number;
}): string {
  const payload: CaptionsChaptersReceiptPayload = {
    uid: opts.userId,
    dur: Math.max(0, opts.durationSeconds),
    cost: Math.max(0, Math.floor(opts.cost)),
    exp: Math.floor(Date.now() / 1000) + (opts.ttlSec ?? DEFAULT_TTL_SEC),
  };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(
    createHmac("sha256", receiptSecret()).update(body).digest(),
  );
  return `${body}.${sig}`;
}

export function verifyCaptionsChaptersReceipt(
  token: unknown,
  userId: number,
): { ok: true; payload: CaptionsChaptersReceiptPayload } | { ok: false } {
  if (typeof token !== "string" || !token.includes(".")) return { ok: false };
  const [body, sig] = token.split(".");
  if (!body || !sig) return { ok: false };

  let expected: Buffer;
  try {
    expected = createHmac("sha256", receiptSecret()).update(body).digest();
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
    typeof payload.uid !== "number" ||
    payload.uid !== userId ||
    typeof payload.exp !== "number" ||
    payload.exp < Math.floor(Date.now() / 1000)
  ) {
    return { ok: false };
  }

  return { ok: true, payload };
}
