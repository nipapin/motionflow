import { NextRequest, NextResponse } from "next/server";
import {
  parseDeviceId,
  resolveCepBearerUser,
  revokeDevice,
} from "@/lib/cep-auth";

export const runtime = "nodejs";

/**
 * POST /api/cep/devices/revoke — sign out one of the user's CEP devices.
 * Body: { device_id: "dev_…" }. Revoking the current device is allowed;
 * the panel's next /me call will then get 401.
 * @see CEP/spunkram-library/docs/BACKEND_CEP_API.md §1.5
 */
export async function POST(req: NextRequest) {
  try {
    const user = await resolveCepBearerUser(req.headers.get("authorization"));
    if (!user) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Invalid or revoked token" },
        { status: 401 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      device_id?: unknown;
    };
    const deviceId = parseDeviceId(body.device_id);
    if (!deviceId) {
      return NextResponse.json(
        { error: "INVALID_DEVICE", message: "Invalid device_id" },
        { status: 400 },
      );
    }

    const revoked = await revokeDevice(user.id, deviceId);
    if (!revoked) {
      return NextResponse.json(
        { error: "INVALID_DEVICE", message: "Device not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[cep/devices/revoke]", err);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Could not revoke device" },
      { status: 500 },
    );
  }
}
