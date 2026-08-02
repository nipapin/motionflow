import { NextRequest, NextResponse } from "next/server";
import { resolveCepBearerUser } from "@/lib/cep-auth";
import { sendTelegramSupportReport } from "@/lib/telegram";

export const runtime = "nodejs";

const MAX_ACTION = 200;
const MAX_ERROR = 4000;
const MAX_STACK = 4000;
const MAX_OS = 500;
const MAX_LOCALE = 32;
const MAX_VERSION = 64;
const MAX_HOST_FIELD = 64;
const MAX_EXTRA_KEYS = 20;
const MAX_EXTRA_VALUE = 500;
const STACK_TG_LIMIT = 1500;
const RATE_WINDOW_MS = 60_000;

type SupportSeverity = "error" | "warning" | "info";

type HostPayload = {
    appId: string;
    appName?: string;
    appVersion: string;
};

type ReportBody = {
    action: string;
    error: string;
    error_code?: string;
    severity: SupportSeverity;
    stack?: string;
    extension_version: string;
    host: HostPayload;
    os: string;
    locale?: string;
    client: string;
    occurred_at: string;
    extra?: Record<string, string | number | boolean | null>;
};

type RateEntry = { count: number; resetAt: number };

const rateBuckets = new Map<string, RateEntry>();

function clientIp(req: NextRequest): string {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) {
        const first = forwarded.split(",")[0]?.trim();
        if (first) return first;
    }
    return req.headers.get("x-real-ip")?.trim() || "unknown";
}

function simpleHash(input: string): string {
    let h = 0;
    for (let i = 0; i < input.length; i++) {
        h = (h * 31 + input.charCodeAt(i)) | 0;
    }
    return String(h);
}

function isRateLimited(key: string): boolean {
    const now = Date.now();
    const entry = rateBuckets.get(key);
    if (!entry || now >= entry.resetAt) {
        rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
        return false;
    }
    if (entry.count >= 1) return true;
    entry.count += 1;
    return false;
}

function clip(value: unknown, max: number): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function parseSeverity(raw: unknown): SupportSeverity {
    if (raw === "warning" || raw === "info" || raw === "error") return raw;
    return "error";
}

function parseHost(raw: unknown): HostPayload | null {
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    const appId = clip(o.appId, MAX_HOST_FIELD);
    const appVersion = clip(o.appVersion, MAX_HOST_FIELD);
    if (!appId || !appVersion) return null;
    const appName = clip(o.appName, MAX_HOST_FIELD) || undefined;
    return { appId, appVersion, appName };
}

function parseExtra(
    raw: unknown,
): Record<string, string | number | boolean | null> | undefined {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const out: Record<string, string | number | boolean | null> = {};
    let n = 0;
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (n >= MAX_EXTRA_KEYS) break;
        const safeKey = clip(key, 64);
        if (!safeKey) continue;
        if (
            value === null ||
            typeof value === "boolean" ||
            typeof value === "number"
        ) {
            out[safeKey] = value as string | number | boolean | null;
            n += 1;
            continue;
        }
        if (typeof value === "string") {
            out[safeKey] = value.length > MAX_EXTRA_VALUE
                ? value.slice(0, MAX_EXTRA_VALUE)
                : value;
            n += 1;
        }
    }
    return Object.keys(out).length ? out : undefined;
}

function parseBody(raw: unknown): ReportBody | null {
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;

    const action = clip(o.action, MAX_ACTION);
    const error = clip(o.error, MAX_ERROR);
    const extension_version = clip(o.extension_version, MAX_VERSION);
    const os = clip(o.os, MAX_OS);
    const client = clip(o.client, 64);
    const occurred_at = clip(o.occurred_at, 64);
    const host = parseHost(o.host);

    if (!action || !error || !extension_version || !os || !client || !occurred_at || !host) {
        return null;
    }
    if (client !== "spunkram-cep") return null;

    return {
        action,
        error,
        error_code: clip(o.error_code, 128) || undefined,
        severity: parseSeverity(o.severity),
        stack: clip(o.stack, MAX_STACK) || undefined,
        extension_version,
        host,
        os,
        locale: clip(o.locale, MAX_LOCALE) || undefined,
        client,
        occurred_at,
        extra: parseExtra(o.extra),
    };
}

function formatTelegramMessage(
    report: ReportBody,
    user?: { id: number; email: string } | null,
): string {
    const hostLabel = report.host.appName
        ? `${report.host.appName} (${report.host.appId}) ${report.host.appVersion}`
        : `${report.host.appId} ${report.host.appVersion}`;

    const lines = [
        "🚨 <b>CEP error</b>",
        `severity: <code>error</code>`,
        `action: <code>${escapeHtml(report.action)}</code>`,
        `error: ${escapeHtml(report.error)}`,
    ];
    if (report.error_code) {
        lines.push(`code: <code>${escapeHtml(report.error_code)}</code>`);
    }
    lines.push(
        `ext: <code>${escapeHtml(report.extension_version)}</code>`,
        `host: <code>${escapeHtml(hostLabel)}</code>`,
        `os: ${escapeHtml(report.os)}`,
    );
    if (report.locale) {
        lines.push(`locale: <code>${escapeHtml(report.locale)}</code>`);
    }
    if (user) {
        lines.push(
            `user: ${escapeHtml(user.email)} (<code>user_${user.id}</code>)`,
        );
    }
    lines.push(`time: <code>${escapeHtml(report.occurred_at)}</code>`);

    if (report.extra) {
        for (const [k, v] of Object.entries(report.extra)) {
            lines.push(
                `${escapeHtml(k)}: <code>${escapeHtml(String(v))}</code>`,
            );
        }
    }

    if (report.stack) {
        const stack = report.stack.slice(0, STACK_TG_LIMIT);
        lines.push(`stack:\n<pre>${escapeHtml(stack)}</pre>`);
    }

    return lines.join("\n");
}

/**
 * POST /api/cep/support/report — CEP error observer → Telegram support topic.
 * Only `severity: "error"` is forwarded to Telegram; warning/info accepted as no-op.
 * Bearer optional (enriches message with user email when present).
 */
export async function POST(req: NextRequest) {
    try {
        let json: unknown;
        try {
            json = await req.json();
        } catch {
            return NextResponse.json(
                { error: "INVALID_BODY", message: "Expected JSON body" },
                { status: 400 },
            );
        }

        const report = parseBody(json);
        if (!report) {
            return NextResponse.json(
                { error: "INVALID_BODY", message: "Missing or invalid report fields" },
                { status: 400 },
            );
        }

        // Soft events: accept but do not page Telegram.
        if (report.severity !== "error") {
            return NextResponse.json(
                { ok: true, delivered: false, reason: "severity_filtered" },
                { status: 202 },
            );
        }

        const ip = clientIp(req);
        const rateKey = `${ip}:${report.action}:${simpleHash(report.error)}`;
        if (isRateLimited(rateKey)) {
            return NextResponse.json(
                { error: "RATE_LIMITED", message: "Too many reports" },
                { status: 429 },
            );
        }

        const user = await resolveCepBearerUser(
            req.headers.get("authorization"),
        ).catch(() => null);

        const text = formatTelegramMessage(
            report,
            user ? { id: user.id, email: user.email } : null,
        );

        // Best-effort: accept the report even if Telegram is down / misconfigured.
        void sendTelegramSupportReport(text).catch((err) => {
            console.error("[cep/support/report] telegram failed:", err);
        });

        return NextResponse.json({ ok: true, delivered: true }, { status: 202 });
    } catch (err) {
        console.error("[cep/support/report]", err);
        return NextResponse.json(
            { error: "SERVER_ERROR", message: "Could not accept report" },
            { status: 500 },
        );
    }
}
