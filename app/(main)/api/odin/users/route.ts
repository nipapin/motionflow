import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isPackagesAdmin } from "@/lib/packages-admin";
import { odinManagementRequest } from "@/lib/odin-management";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function handle(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isPackagesAdmin(user.email)) return json({ error: "FORBIDDEN" }, 403);
  try {
    if (req.method === "POST") {
      if (req.headers.get("origin") !== req.nextUrl.origin) return json({ error: "INVALID_ORIGIN" }, 403);
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "INVALID_INPUT" }, 400);
      return json(await odinManagementRequest(new URLSearchParams(), {
        user_id: body.user_id, action: body.action, reason: body.reason,
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
    const safe = ["ODIN_NOT_CONFIGURED", "NOT_FOUND", "INVALID_INPUT"].includes(code) ? code : "ODIN_UNAVAILABLE";
    return json({ error: safe }, safe === "NOT_FOUND" ? 404 : safe === "INVALID_INPUT" ? 400 : 503);
  }
}
export const GET = handle;
export const POST = handle;
