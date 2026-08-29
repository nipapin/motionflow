import { NextRequest, NextResponse } from "next/server";
import { resolveCepBearerUser } from "@/lib/cep-auth";
import {
  getCepClientConfig,
  requireCepClientConfig,
} from "@/lib/cep-client-registry";
import {
  CEP_INSTALLS_MAX_PACKS,
  replaceCepDeviceInstalls,
  type CepInstallPackInput,
} from "@/lib/cep-device-installs";
import { ensurePackagesProjectsTable } from "@/lib/packages-authors-db";

export const runtime = "nodejs";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function parsePacks(body: Record<string, unknown>): CepInstallPackInput[] | null {
  // Preferred: { packs: [{ pack_id, version? }] }
  if (Array.isArray(body.packs)) {
    const out: CepInstallPackInput[] = [];
    for (const item of body.packs.slice(0, CEP_INSTALLS_MAX_PACKS)) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const o = item as Record<string, unknown>;
      const id = typeof o.pack_id === "number" ? o.pack_id : Number(o.pack_id);
      if (!Number.isInteger(id) || id <= 0) continue;
      const version =
        typeof o.version === "string"
          ? o.version
          : o.version == null
            ? null
            : String(o.version);
      out.push({ pack_id: id, version });
    }
    return out;
  }

  // Legacy: { pack_ids: number[] }
  if (Array.isArray(body.pack_ids)) {
    const out: CepInstallPackInput[] = [];
    for (const item of body.pack_ids.slice(0, CEP_INSTALLS_MAX_PACKS)) {
      const n = typeof item === "number" ? item : Number(item);
      if (Number.isInteger(n) && n > 0) out.push({ pack_id: n });
    }
    return out;
  }

  return null;
}

/**
 * POST /api/cep/telemetry/installs — full snapshot of packs on disk for this device.
 * Bearer required.
 * Body (preferred): { packs: [{ pack_id: number, version?: string }] }
 * Body (legacy):    { pack_ids: number[] }
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

    const packs = parsePacks(json as Record<string, unknown>);
    if (!packs) {
      return NextResponse.json(
        {
          error: "INVALID_BODY",
          message: "packs or pack_ids must be an array",
        },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const cfg =
      getCepClientConfig(user.client) ?? requireCepClientConfig("spunkram-cep");

    await ensurePackagesProjectsTable();
    const result = await replaceCepDeviceInstalls({
      deviceId: user.deviceId,
      authorId: cfg.authorId,
      packs,
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
    console.error("[cep/telemetry/installs]", err);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Could not record installs" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
