import { NextResponse } from "next/server";
import {
  defaultFfmpegUrls,
  readLatestManifestFromR2,
} from "@/lib/spunkram-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cep/update — public Spunkram extension update manifest.
 * No auth. Backed by R2 `public/downloads/spunkram/latest.json`.
 */
export async function GET() {
  try {
    const fromR2 = await readLatestManifestFromR2();
    if (fromR2) {
      return NextResponse.json(fromR2, {
        headers: { "Cache-Control": "public, max-age=60" },
      });
    }
  } catch (err) {
    console.error("[cep/update] R2 read failed", err);
  }

  // Soft fallback so the panel still knows ffmpeg CDN URLs before first release.
  let ffmpeg: { win: string; mac: string };
  try {
    ffmpeg = defaultFfmpegUrls();
  } catch {
    const base = (
      process.env.R2_PUBLIC_CDN ||
      process.env.NEXT_PUBLIC_R2_PUBLIC_CDN ||
      "https://cdn.motionflow.pro"
    ).replace(/\/+$/, "");
    ffmpeg = {
      win: `${base}/public/downloads/ffmpeg/win/ffmpeg.exe`,
      mac: `${base}/public/downloads/ffmpeg/mac/ffmpeg-mac.zip`,
    };
  }

  return NextResponse.json(
    {
      version: null,
      zxpUrl: null,
      changelog: "",
      publishedAt: null,
      ffmpeg,
    },
    { status: 200, headers: { "Cache-Control": "public, max-age=30" } },
  );
}
