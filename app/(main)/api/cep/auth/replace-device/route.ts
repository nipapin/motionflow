import { NextRequest, NextResponse } from "next/server";
import {
  cepClientIp,
  normalizeCode,
  normalizeDeviceCode,
  parseDeviceId,
  replaceDeviceForAuthSession,
} from "@/lib/cep-auth";
import { checkCepAuthTokenRateLimit } from "@/lib/cep-auth-rate-limit";

export const runtime = "nodejs";

/**
 * POST /api/cep/auth/replace-device — complete a device_limit login by revoking
 * one existing device. Body: { code, device_code, revoke_device_id }.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = cepClientIp(req.headers);
    const limited = await checkCepAuthTokenRateLimit(ip);
    if (!limited.ok) {
      return NextResponse.json(
        {
          error: "RATE_LIMITED",
          message: "Too many requests. Slow down.",
        },
        {
          status: 429,
          headers: { "Retry-After": String(limited.retryAfterSec) },
        },
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      code?: unknown;
      device_code?: unknown;
      revoke_device_id?: unknown;
    };
    const code = normalizeCode(body.code);
    const deviceCode = normalizeDeviceCode(body.device_code);
    const revokeDeviceId = parseDeviceId(body.revoke_device_id);
    if (!code || !deviceCode || !revokeDeviceId) {
      return NextResponse.json(
        {
          error: "INVALID_BODY",
          message: "code, device_code, and revoke_device_id required",
        },
        { status: 400 },
      );
    }

    const result = await replaceDeviceForAuthSession({
      code,
      deviceCode,
      revokeDeviceId,
    });

    if (!result.ok) {
      const status =
        result.error === "CODE_EXPIRED" || result.error === "INVALID_CODE"
          ? 400
          : result.error === "INVALID_DEVICE"
            ? 404
            : 409;
      return NextResponse.json(
        { error: result.error, message: result.message },
        { status },
      );
    }

    return NextResponse.json({
      status: "complete",
      token: result.token,
      user: {
        id: `user_${result.user.id}`,
        email: result.user.email,
        name: result.user.name || undefined,
      },
    });
  } catch (err) {
    console.error("[cep/auth/replace-device]", err);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Could not replace device" },
      { status: 500 },
    );
  }
}
