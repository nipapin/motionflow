import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import {
  approveAuthSession,
  cepClientIp,
  denyAuthSession,
  getAuthSessionInfo,
  normalizeCode,
} from "@/lib/cep-auth";

export const runtime = "nodejs";

/**
 * POST /api/cep/auth/confirm — the /cep/login web page (session cookie auth)
 * approves or denies a pending device-code login.
 * Body: { code: string, action: "approve" | "deny" }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Sign in first" },
        { status: 401 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      code?: unknown;
      action?: unknown;
    };
    const code = normalizeCode(body.code);
    if (!code) {
      return NextResponse.json(
        { error: "INVALID_CODE", message: "Invalid or malformed code" },
        { status: 400 },
      );
    }

    const action = body.action === "deny" ? "deny" : "approve";

    if (action === "deny") {
      await denyAuthSession(code);
      return NextResponse.json({ ok: true, status: "denied" });
    }

    const result = await approveAuthSession(
      code,
      user.id,
      cepClientIp(req.headers),
    );
    if (!result.ok) {
      const messages: Record<string, string> = {
        INVALID_CODE: "This code is invalid or was already used.",
        CODE_EXPIRED: "This code has expired. Restart sign-in in the panel.",
        DEVICE_LIMIT:
          "Device limit reached. Remove another device in the panel's Account tab and try again.",
      };
      const status = result.error === "DEVICE_LIMIT" ? 403 : 400;
      return NextResponse.json(
        { error: result.error, message: messages[result.error] },
        { status },
      );
    }

    return NextResponse.json({ ok: true, status: "complete" });
  } catch (err) {
    console.error("[cep/auth/confirm]", err);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Could not confirm sign-in" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/cep/auth/confirm?code=… — code status for the /cep/login page
 * (shows what device is asking before the user approves).
 */
export async function GET(req: NextRequest) {
  try {
    const code = normalizeCode(req.nextUrl.searchParams.get("code"));
    if (!code) {
      return NextResponse.json(
        { error: "INVALID_CODE", message: "Invalid or malformed code" },
        { status: 400 },
      );
    }
    const info = await getAuthSessionInfo(code);
    if (!info) {
      return NextResponse.json(
        { error: "INVALID_CODE", message: "Unknown code" },
        { status: 404 },
      );
    }
    return NextResponse.json({
      code: info.code,
      status: info.status,
      client: info.client,
      device: info.device,
    });
  } catch (err) {
    console.error("[cep/auth/confirm GET]", err);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Could not load code status" },
      { status: 500 },
    );
  }
}
