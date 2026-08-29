import { NextRequest, NextResponse } from "next/server";
import { resolveCepBearerUser } from "@/lib/cep-auth";
import {
  getCepClientConfig,
  requireCepClientConfig,
} from "@/lib/cep-client-registry";
import {
  CEP_ACTIVE_MAX_PACKS,
  replaceCepDeviceActivePacks,
} from "@/lib/cep-device-active-packs";
import { ensurePackagesProjectsTable } from "@/lib/packages-authors-db";

export const runtime = "nodejs";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * POST /api/cep/telemetry/active-packs — packs currently open / in use on this device.
 * Bearer required. Body: { pack_ids: number[] } (full snapshot; empty = none active).
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

    if (!json || typeof json !== "object" || Array.isArray(json)) {
      return NextResponse.json(
        { error: "INVALID_BODY", message: "Expected object body" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const rawIds = (json as { pack_ids?: unknown }).pack_ids;
    if (!Array.isArray(rawIds)) {
      return NextResponse.json(
        { error: "INVALID_BODY", message: "pack_ids must be an array" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const packIds: number[] = [];
    for (const item of rawIds.slice(0, CEP_ACTIVE_MAX_PACKS)) {
      const n = typeof item === "number" ? item : Number(item);
      if (Number.isInteger(n) && n > 0) packIds.push(n);
    }

    const cfg =
      getCepClientConfig(user.client) ?? requireCepClientConfig("spunkram-cep");

    await ensurePackagesProjectsTable();
    const result = await replaceCepDeviceActivePacks({
      deviceId: user.deviceId,
      authorId: cfg.authorId,
      packIds,
    });

    return NextResponse.json(
      {
        ok: true,
        stored: result.stored,
        rejected: result.rejected,
      },
      { status: 202, headers: CORS_HEADERS },
    );
  } catch (err) {
    console.error("[cep/telemetry/active-packs]", err);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Could not record active packs" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
