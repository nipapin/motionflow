import { NextRequest, NextResponse } from "next/server";

/**
 * Thin reverse proxy to the legacy Laravel backend (motionflow.com).
 *
 * Used by the routes ported from Laravel `routes/api.php`. The Next.js app
 * sits on `next.motionflow.pro` while Laravel is on `motionflow.com`, so the
 * front-end can keep calling `/api/...` and we forward those calls server-side
 * to Laravel — keeping Laravel as the source of truth for the endpoints we
 * have not migrated yet.
 *
 * Auth note: Sanctum/session cookies live on `*.motionflow.com` and won't be
 * sent to `next.motionflow.pro`, so endpoints behind `auth:sanctum` (e.g.
 * `/api/user`) will return 401 when called via this proxy unless the caller
 * supplies its own credentials (Authorization header, AtomX-Secure-Check, …).
 */

const DEFAULT_LARAVEL_BASE_URL = "https://motionflow.com";

const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "content-encoding",
    "content-length",
]);

const FORWARDED_REQUEST_HEADERS = [
    "accept",
    "accept-language",
    "authorization",
    "cookie",
    "content-type",
    "user-agent",
    "x-requested-with",
    "x-forwarded-for",
    "x-real-ip",
    "atomx-secure-check",
];

function getLaravelBaseUrl(): string {
    const fromEnv = process.env.LARAVEL_API_URL?.trim();
    return (fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_LARAVEL_BASE_URL).replace(/\/+$/, "");
}

function buildUpstreamUrl(req: NextRequest, targetPath: string): URL {
    const base = getLaravelBaseUrl();
    const path = targetPath.startsWith("/") ? targetPath : `/${targetPath}`;
    const url = new URL(`${base}${path}`);
    for (const [key, value] of req.nextUrl.searchParams.entries()) {
        url.searchParams.append(key, value);
    }
    return url;
}

function buildUpstreamHeaders(req: NextRequest): Headers {
    const headers = new Headers();
    for (const name of FORWARDED_REQUEST_HEADERS) {
        const value = req.headers.get(name);
        if (value) headers.set(name, value);
    }
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!headers.has("x-requested-with")) headers.set("x-requested-with", "XMLHttpRequest");

    const forwardedFor = req.headers.get("x-forwarded-for");
    const remoteIp = req.headers.get("x-real-ip") ?? forwardedFor?.split(",")[0]?.trim();
    if (remoteIp) {
        headers.set("x-forwarded-for", forwardedFor ?? remoteIp);
        if (!headers.has("x-real-ip")) headers.set("x-real-ip", remoteIp);
    }

    return headers;
}

async function buildUpstreamBody(req: NextRequest): Promise<BodyInit | undefined> {
    if (req.method === "GET" || req.method === "HEAD") return undefined;
    const buf = await req.arrayBuffer();
    return buf.byteLength === 0 ? undefined : buf;
}

/**
 * Forward the current request to `targetPath` on the Laravel backend.
 *
 * @param req         the incoming Next.js request
 * @param targetPath  Laravel-side path, e.g. `/api/user`, `/api/item/verify/abc`.
 *                    Query string from the incoming request is appended automatically.
 */
export async function proxyToLaravel(req: NextRequest, targetPath: string): Promise<NextResponse> {
    const upstreamUrl = buildUpstreamUrl(req, targetPath);
    const headers = buildUpstreamHeaders(req);
    const body = await buildUpstreamBody(req);

    let upstream: Response;
    try {
        upstream = await fetch(upstreamUrl.toString(), {
            method: req.method,
            headers,
            body,
            redirect: "manual",
            cache: "no-store",
        });
    } catch (err) {
        console.error(`[laravel-proxy] ${req.method} ${upstreamUrl.toString()} failed:`, err);
        return NextResponse.json(
            { success: false, message: "Upstream Laravel API unreachable" },
            { status: 502 },
        );
    }

    const responseHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
        if (HOP_BY_HOP_RESPONSE_HEADERS.has(key.toLowerCase())) return;
        responseHeaders.append(key, value);
    });

    const buffer = await upstream.arrayBuffer();
    return new NextResponse(buffer, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
    });
}
