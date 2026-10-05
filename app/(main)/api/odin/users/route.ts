import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isPackagesAdmin } from "@/lib/packages-admin";
import { odinManagementRequest } from "@/lib/odin-management";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const defaultReasons: Record<string, string> = {
  grant: "Grant extension access from Motionflow",
  revoke: "Block extension access from Motionflow",
  reset: "Follow Odin subscription from Motionflow",
  revoke_device: "Revoke CEP device from Motionflow",
};

function sameOrigin(req: NextRequest) {
  // The custom Next server builds nextUrl with its internal hostname/port.
  // Nginx preserves the public Host and overwrites X-Forwarded-Proto.
  const host = req.headers.get("host") || req.nextUrl.host;
  const protocol = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || req.nextUrl.protocol.slice(0, -1);
  return ["http", "https"].includes(protocol) && req.headers.get("origin") === `${protocol}://${host}`;
}

async function handle(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isPackagesAdmin(user.email)) return json({ error: "FORBIDDEN" }, 403);
  try {
    if (req.method === "POST") {
      if (!sameOrigin(req)) return json({ error: "INVALID_ORIGIN" }, 403);
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "INVALID_INPUT" }, 400);
      if (typeof body.action !== "string" || !Object.hasOwn(defaultReasons, body.action)) return json({ error: "INVALID_INPUT" }, 400);
      if (typeof body.user_id !== "string" || !body.user_id.trim() || body.user_id.length > 128) return json({ error: "INVALID_INPUT" }, 400);
      if (body.reason !== undefined && (typeof body.reason !== "string" || body.reason.length > 500)) return json({ error: "INVALID_INPUT" }, 400);
      if (["expires_at", "device_id"].some(key => body[key] !== undefined && typeof body[key] !== "string")) return json({ error: "INVALID_INPUT" }, 400);
      if (body.action === "grant" && (!body.expires_at || !Number.isFinite(Date.parse(body.expires_at)) || Date.parse(body.expires_at) <= Date.now())) return json({ error: "INVALID_INPUT" }, 400);
      if (body.action === "revoke_device" && (!body.device_id?.trim() || body.device_id.length > 128)) return json({ error: "INVALID_INPUT" }, 400);
      const reason = body.reason?.trim() || defaultReasons[body.action];
      return json(await odinManagementRequest(new URLSearchParams(), {
        user_id: body.user_id, action: body.action, reason,
        expires_at: body.expires_at, device_id: body.device_id, actor: user.email,
      }));
    }
    const query = new URLSearchParams();
    for (const key of ["q", "page", "user_id"]) {
      const value = req.nextUrl.searchParams.get(key);
      if (value !== null) query.set(key, value);
    }
    return json(await odinManagementRequest(query));
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const safe = ["ODIN_NOT_CONFIGURED", "ODIN_UNAUTHORIZED", "ODIN_MANAGEMENT_DISABLED", "NOT_FOUND", "INVALID_INPUT"].includes(code) ? code : "ODIN_UNAVAILABLE";
    return json({ error: safe }, safe === "NOT_FOUND" ? 404 : safe === "INVALID_INPUT" ? 400 : 503);
  }
}
export const GET = handle;
export const POST = handle;
