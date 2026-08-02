import { NextRequest, NextResponse } from "next/server";
import { CEP_LANGUAGE_OPTIONS, CEP_VOICES } from "@/lib/cep-voiceover";

export const runtime = "nodejs";

/**
 * GET /api/cep/voiceover/voices — MiniMax voices + language_boost options
 * for the CEP Voiceover tool. Public catalog (no auth); generation is gated.
 * @see CEP/spunkram-library/docs/BACKEND_CEP_API.md §3.1
 */
export async function GET(req: NextRequest) {
  const origin = publicOrigin(req);
  return NextResponse.json({
    voices: CEP_VOICES.map((v) => ({
      id: v.id,
      name: v.name,
      gender: v.gender,
      preview_url: `${origin}${v.previewPath}`,
    })),
    languages: CEP_LANGUAGE_OPTIONS.map((l) => ({
      id: l.id,
      name: l.label,
    })),
  });
}

/** Dev: request origin (local server); production: env → motionflow.pro. */
function publicOrigin(req: NextRequest): string {
  if (process.env.NODE_ENV !== "production") return req.nextUrl.origin;
  const fromEnv =
    process.env.AUTH_PUBLIC_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) {
    try {
      return new URL(fromEnv).origin;
    } catch {
      /* fall through */
    }
  }
  return "https://motionflow.pro";
}
