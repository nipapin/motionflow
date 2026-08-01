import { NextRequest, NextResponse } from "next/server";
import {
  cepClientIp,
  claimAuthToken,
  normalizeCode,
  normalizeDeviceCode,
} from "@/lib/cep-auth";
import { checkCepAuthTokenRateLimit } from "@/lib/cep-auth-rate-limit";

export const runtime = "nodejs";

/**
 * POST /api/cep/auth/token — panel polls the device-code session.
 * Body: { code, device_code }. Short `code` alone cannot claim the Bearer.
 * @see CEP/spunkram-library/docs/BACKEND_CEP_API.md §1.3
 */
export async function POST(req: NextRequest) {
  try {
    const ip = cepClientIp(req.headers);
    const limited = await checkCepAuthTokenRateLimit(ip);
    if (!limited.ok) {
      return NextResponse.json(
        {
          status: "pending",
          error: "RATE_LIMITED",
          message: "Too many polls. Slow down.",
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
    };
    const code = normalizeCode(body.code);
    const deviceCode = normalizeDeviceCode(body.device_code);
    if (!code || !deviceCode) {
      return NextResponse.json(
        {
          status: "expired",
          error: "INVALID_CODE",
          message: "Invalid code or device_code",
        },
        { status: 400 },
      );
    }

    const result = await claimAuthToken(code, deviceCode);
    if (result.status === "complete") {
      return NextResponse.json({
        status: "complete",
        token: result.token,
        user: {
          id: `user_${result.user.id}`,
          email: result.user.email,
          name: result.user.name || undefined,
        },
      });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cep/auth/token]", err);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Could not check sign-in status" },
      { status: 500 },
    );
  }
}
