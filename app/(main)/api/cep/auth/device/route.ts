import { NextRequest, NextResponse } from "next/server";
import {
  cepClientIp,
  createAuthSession,
  type CepDeviceFingerprint,
} from "@/lib/cep-auth";
import { checkCepAuthDeviceRateLimit } from "@/lib/cep-auth-rate-limit";
import {
  CepUnknownClientError,
  normalizeCepClient,
  requireCepClientConfig,
} from "@/lib/cep-client-registry";

export const runtime = "nodejs";

/**
 * POST /api/cep/auth/device — start a device-code login session for the CEP panel.
 * Accepts only `client` (no author_id). Unknown clients → 400 UNKNOWN_CLIENT.
 * @see CEP/spunkram-library/docs/BACKEND_CEP_API.md §1.1
 */
export async function POST(req: NextRequest) {
  try {
    const ip = cepClientIp(req.headers);
    const limited = await checkCepAuthDeviceRateLimit(ip);
    if (!limited.ok) {
      return NextResponse.json(
        {
          error: "RATE_LIMITED",
          message: "Too many sign-in attempts. Please wait and try again.",
        },
        {
          status: 429,
          headers: { "Retry-After": String(limited.retryAfterSec) },
        },
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      usp?: unknown;
      device?: unknown;
      client?: unknown;
    };

    const usp =
      typeof body.usp === "string" ? body.usp.slice(0, 4096) : null;

    let device: CepDeviceFingerprint | null = null;
    if (body.device && typeof body.device === "object") {
      const d = body.device as Record<string, unknown>;
      device = {
        mac: typeof d.mac === "string" ? d.mac.slice(0, 64) : undefined,
        user: typeof d.user === "string" ? d.user.slice(0, 191) : undefined,
        os: typeof d.os === "string" ? d.os.slice(0, 191) : undefined,
      };
    }

    const client = normalizeCepClient(body.client);
    let cfg;
    try {
      cfg = requireCepClientConfig(client);
    } catch (e) {
      if (e instanceof CepUnknownClientError) {
        return NextResponse.json(
          { error: "UNKNOWN_CLIENT", message: `Unknown client: ${client}` },
          { status: 400 },
        );
      }
      throw e;
    }

    const { code, deviceCode, expiresIn, interval } = await createAuthSession({
      usp,
      device,
      client: cfg.client,
      ip,
    });

    const origin = verificationOrigin(req);
    const path = cfg.verificationPath.startsWith("/")
      ? cfg.verificationPath
      : `/${cfg.verificationPath}`;
    const verificationUrl = new URL(`${origin}${path}`);
    verificationUrl.searchParams.set("code", code);
    verificationUrl.searchParams.set("client", cfg.client);

    return NextResponse.json({
      code,
      device_code: deviceCode,
      verification_url: verificationUrl.toString(),
      interval,
      expires_in: expiresIn,
    });
  } catch (err) {
    console.error("[cep/auth/device]", err);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Could not start sign-in" },
      { status: 500 },
    );
  }
}

function verificationOrigin(req: NextRequest): string {
  const fromEnv =
    process.env.AUTH_PUBLIC_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) {
    try {
      const parsed = new URL(fromEnv);
      if (!/^(localhost|127\.0\.0\.1)$/i.test(parsed.hostname)) {
        return parsed.origin;
      }
    } catch {
      /* fall through */
    }
  }
  if (process.env.NODE_ENV !== "production") return req.nextUrl.origin;
  return "https://motionflow.pro";
}
