import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";

/**
 * Native port of Laravel `App\Http\Controllers\ApiStickSubsMf` — secret/proof
 * helpers and DB-side queries for `mf_subscription/check` & `recheck`.
 */

/**
 * Header secret accepted from the Atomic-side caller. Must match the literal
 * baked into the legacy Laravel controller for backward compatibility.
 */
const ATOMX_SECURE_CHECK_LITERAL = "1cfyBh4utabuhq";

/**
 * Pre-image used to derive the HMAC key for the `proof_payload`. Keeping the
 * exact same literal is what allows Atomic-side to verify this server's proof.
 */
const SECURE_PROOF_SECRET_LITERAL = "sakjIDAS821ki";

const ATOMX_SECURE_CHECK_HEADER = "atomx-secure-check";

export interface SubscriptionRow extends RowDataPacket {
    id: number;
    buyer_id: number;
    author_id: number;
    status: number;
    plan: string | null;
    type: string | null;
    amount: string | number | null;
    amount_summary: string | number | null;
    subscription_id: string;
    payment_id: string | null;
    system: string | null;
    ends_at: Date | string | null;
    trial_ends_at: Date | string | null;
    created_at: Date | string | null;
    updated_at: Date | string | null;
    /* Joined buyer columns. */
    buyer_email: string | null;
    buyer_first_name: string | null;
    buyer_last_name: string | null;
    buyer_company_name: string | null;
}

export type SubscriptionStatusLabel = "active" | "cancelled" | "expired" | "on-hold";

export interface SyncArgs {
    status: SubscriptionStatusLabel;
    type: "Personal";
    billing_period: string | null;
    order_id: number;
    generated_hash: string;
    currency: "USD";
    price: number;
    billing_info: string;
    billing_mail: string | null;
    subtotal: number;
}

export interface SubscriptionCheckResponse {
    subscription: Record<string, unknown>;
    author: number;
    sync_args: SyncArgs;
}

function timingSafeEqualString(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/**
 * Port of `rejectUnlessAtomxSecure` — returns `true` if the request must be
 * rejected with 403 due to a missing or wrong header. Use timing-safe compare.
 */
export function isAtomxSecureRejected(headers: Headers): boolean {
    const sent = headers.get(ATOMX_SECURE_CHECK_HEADER) ?? "";
    return !timingSafeEqualString(sent, ATOMX_SECURE_CHECK_LITERAL);
}

/** Equivalent of Laravel `subscriptionStatusLabel`. */
export function subscriptionStatusLabel(
    dbStatus: number,
    expiredWhileMarkedActive: boolean,
): SubscriptionStatusLabel {
    if (expiredWhileMarkedActive) return "expired";
    switch (dbStatus) {
        case 1:
            return "active";
        case 0:
            return "cancelled";
        case -1:
            return "expired";
        default:
            return "on-hold";
    }
}

function toDateOrNull(value: unknown): Date | null {
    if (value == null || value === "") return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? null : d;
}

function toIsoOrNull(value: unknown): string | null {
    const d = toDateOrNull(value);
    return d ? d.toISOString() : null;
}

function toNum(value: unknown, fallback = 0): number {
    if (value == null) return fallback;
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function rowToSerializableSubscription(row: SubscriptionRow): Record<string, unknown> {
    /*
     * Laravel `toArray()` returns model attributes — including the joined buyer
     * columns we explicitly selected. We replicate that flat shape and emit
     * dates as ISO strings (Laravel serializes Carbon as ISO 8601 with
     * microseconds; consumers tolerate plain ISO).
     */
    const out: Record<string, unknown> = { ...row };
    out.amount = row.amount == null ? null : toNum(row.amount);
    out.amount_summary = row.amount_summary == null ? null : toNum(row.amount_summary);
    out.ends_at = toIsoOrNull(row.ends_at);
    out.trial_ends_at = toIsoOrNull(row.trial_ends_at);
    out.created_at = toIsoOrNull(row.created_at);
    out.updated_at = toIsoOrNull(row.updated_at);
    return out;
}

function buildResponseData(row: SubscriptionRow): SubscriptionCheckResponse {
    const subscription = rowToSerializableSubscription(row);

    const now = new Date();
    const isLifetime = row.plan === "lifetime" || !row.ends_at;
    const endsAt = toDateOrNull(row.ends_at);
    const trialEndsAt = toDateOrNull(row.trial_ends_at);

    const isExpiredByEndDate =
        !isLifetime && endsAt != null && endsAt.getTime() <= now.getTime();
    const isExpiredByTrialDate =
        !isLifetime && trialEndsAt != null && trialEndsAt.getTime() <= now.getTime();
    const expiredWhileActive =
        Number(row.status) === 1 && (isExpiredByEndDate || isExpiredByTrialDate);

    const statusLabel = subscriptionStatusLabel(Number(row.status), expiredWhileActive);
    subscription.status = statusLabel;

    const billingFirstName = (row.buyer_first_name ?? "").trim();
    const billingLastName = (row.buyer_last_name ?? "").trim();
    const billingCompany = (row.buyer_company_name ?? "").trim();
    const billingInfo = `${billingFirstName}:${billingLastName}:${billingCompany}`;

    const sync_args: SyncArgs = {
        status: statusLabel,
        type: "Personal",
        billing_period: row.plan,
        order_id: Number(row.id),
        generated_hash: String(row.subscription_id),
        currency: "USD",
        price: toNum(row.amount),
        billing_info: billingInfo,
        billing_mail: row.buyer_email ?? null,
        subtotal: row.amount_summary == null ? 0 : Math.trunc(toNum(row.amount_summary)),
    };

    return { subscription, author: Number(row.author_id), sync_args };
}

const SUBSCRIPTION_SELECT_SQL = `
    SELECT
        subscription_systems.*,
        buyers.email AS buyer_email,
        buyers.first_name AS buyer_first_name,
        buyers.last_name AS buyer_last_name,
        buyers.company_name AS buyer_company_name
    FROM subscription_systems
    INNER JOIN users AS buyers ON subscription_systems.buyer_id = buyers.id
`;

/** Port of `ApiStickSubsMf::checkSubscription` — token+email lookup. */
export async function checkSubscription({
    token,
    email,
}: {
    token: string;
    email: string;
}): Promise<SubscriptionCheckResponse | null> {
    const pool = getPool();
    try {
        const [rows] = await pool.execute<SubscriptionRow[]>(
            `${SUBSCRIPTION_SELECT_SQL}
             WHERE subscription_systems.subscription_id = ? AND buyers.email = ?
             ORDER BY subscription_systems.id DESC
             LIMIT 1`,
            [token, email],
        );
        const row = rows[0];
        if (!row) return null;
        return buildResponseData(row);
    } catch (err) {
        console.error("[checkSubscription] MySQL query failed:", err);
        return null;
    }
}

/** HMAC key derived from `SECURE_PROOF_SECRET_LITERAL` — must match Laravel. */
function subscriptionProofSecret(): Buffer {
    return createHash("sha256").update(SECURE_PROOF_SECRET_LITERAL, "utf8").digest();
}

export interface ParsedProof {
    id: number;
    email: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Port of `verifySubscriptionProof` — verifies the HMAC and decodes
 * `{v:1, id, email}` from the base64 inner payload.
 */
export function verifySubscriptionProof(
    proofPayloadB64: string | null | undefined,
    proofHex: string | null | undefined,
): ParsedProof | null {
    if (!proofPayloadB64 || !proofHex) return null;

    const expected = createHmac("sha256", subscriptionProofSecret())
        .update(proofPayloadB64, "utf8")
        .digest("hex");

    if (!timingSafeEqualString(expected, proofHex)) return null;

    let inner: string;
    try {
        inner = Buffer.from(proofPayloadB64, "base64").toString("utf8");
    } catch {
        return null;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(inner);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;
    if (obj.v !== 1) return null;
    const id = Number(obj.id);
    if (!Number.isFinite(id) || id < 1) return null;
    const emailRaw = typeof obj.email === "string" ? obj.email : "";
    const email = emailRaw.trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) return null;
    return { id, email };
}

/** Port of `ApiStickSubsMf::recheckSubscriptionWithProof` DB query. */
export async function recheckSubscription(parsed: ParsedProof): Promise<SubscriptionCheckResponse | null> {
    const pool = getPool();
    try {
        const [rows] = await pool.execute<SubscriptionRow[]>(
            `${SUBSCRIPTION_SELECT_SQL}
             WHERE subscription_systems.id = ? AND buyers.email = ?
             LIMIT 1`,
            [parsed.id, parsed.email],
        );
        const row = rows[0];
        if (!row) return null;
        return buildResponseData(row);
    } catch (err) {
        console.error("[recheckSubscription] MySQL query failed:", err);
        return null;
    }
}
