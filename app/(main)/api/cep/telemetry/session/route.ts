import { NextRequest, NextResponse } from "next/server";
import { resolveCepBearerUser } from "@/lib/cep-auth";
import { getCepClientConfig } from "@/lib/cep-client-registry";
import { recordCepClientSession } from "@/lib/cep-client-sessions";

export const runtime = "nodejs";

const MAX_OS = 255;
const MAX_VERSION = 64;
const MAX_HOST_FIELD = 64;
const MAX_LOCALE = 32;
const MAX_CLIENT = 64;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

type HostPayload = {
  appId: string;
  appName?: string;
  appVersion: string;
};

type SessionBody = {
  client: string;
  extension_version: string;
  host: HostPayload;
  os: string;
  locale?: string;
};

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

function clip(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
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

function parseBody(raw: unknown): SessionBody | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const client = clip(o.client, MAX_CLIENT);
  const extension_version = clip(o.extension_version, MAX_VERSION);
  const os = clip(o.os, MAX_OS);
  const host = parseHost(o.host);

  if (!client || !extension_version || !os || !host) return null;
  if (!getCepClientConfig(client)) return null;

  return {
    client,
    extension_version,
    host,
    os,
    locale: clip(o.locale, MAX_LOCALE) || undefined,
  };
}

/**
 * POST /api/cep/telemetry/session — record host app version + OS on CEP sign-in / session open.
 * Requires Bearer. Deduped server-side (~12h) for the same environment combo.
 */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    const user = await resolveCepBearerUser(req.headers.get("authorization"));
    if (!user) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Invalid or revoked token" },
        { status: 401, headers: CORS_HEADERS },
      );
    }

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json(
        { error: "INVALID_BODY", message: "Expected JSON body" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const body = parseBody(json);
    if (!body) {
      return NextResponse.json(
        { error: "INVALID_BODY", message: "Missing or invalid session fields" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const result = await recordCepClientSession({
      userId: user.id,
      deviceId: user.deviceId,
      client: body.client,
      hostAppId: body.host.appId,
      hostAppName: body.host.appName ?? null,
      hostVersion: body.host.appVersion,
      os: body.os,
      extensionVersion: body.extension_version,
      locale: body.locale ?? null,
      ip: clientIp(req),
    });

    return NextResponse.json(
      { ok: true, inserted: result.inserted, reason: result.reason },
      { status: 202, headers: CORS_HEADERS },
    );
  } catch (err) {
    console.error("[cep/telemetry/session]", err);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Could not record session" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
