import { NextRequest, NextResponse } from "next/server";
import {
  bearerFromRequest,
  requireCaptionsAuth,
} from "@/lib/auth/resolve-captions-user";
import { isSpunkramBetaTester } from "@/lib/spunkram-beta";
import {
  defaultFfmpegUrls,
  readBetaManifestFromR2,
  readLatestManifestFromR2,
  type SpunkramLatestManifest,
} from "@/lib/spunkram-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same rules as CEP `compareVersions` — release > matching prerelease. */
function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const clean = v.replace(/^v/i, "");
    const dash = clean.indexOf("-");
    const core = (dash >= 0 ? clean.slice(0, dash) : clean)
      .split(".")
      .map((x) => parseInt(x, 10) || 0);
    const pre = dash >= 0 ? clean.slice(dash + 1) : null;
    return { core, pre };
  };
  const A = parse(a);
  const B = parse(b);
  const n = Math.max(A.core.length, B.core.length);
  for (let i = 0; i < n; i++) {
    const d = (A.core[i] || 0) - (B.core[i] || 0);
    if (d !== 0) return d;
  }
  if (A.pre === null && B.pre !== null) return 1;
  if (A.pre !== null && B.pre === null) return -1;
  if (A.pre === null && B.pre === null) return 0;
  const preNum = (p: string) => {
    const m = p.match(/beta\.(\d+)/i);
    return m ? parseInt(m[1], 10) : 0;
  };
  return preNum(A.pre!) - preNum(B.pre!);
}

function emptyManifest(ffmpeg: SpunkramLatestManifest["ffmpeg"]) {
  return {
    version: null as string | null,
    zxpUrl: null as string | null,
    changelog: "",
    publishedAt: null as string | null,
    channel: "stable" as const,
    ffmpeg,
  };
}

/**
 * GET /api/cep/update — Spunkram extension update manifest (signed-in CEP only).
 * Stable: R2 `latest.json`.
 * Beta: R2 `beta.json` when the user is on the beta-tester allowlist.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCaptionsAuth({ bearer: bearerFromRequest(req) });
  if (!auth.ok) return auth.response;

  let ffmpeg: SpunkramLatestManifest["ffmpeg"];
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

  try {
    const stable = await readLatestManifestFromR2();
    let beta: SpunkramLatestManifest | null = null;

    if (isSpunkramBetaTester(auth.user.email)) {
      beta = await readBetaManifestFromR2();
    }

    let chosen: SpunkramLatestManifest | null = stable;
    if (beta?.version && beta.zxpUrl) {
      if (!stable?.version || compareVersions(beta.version, stable.version) > 0) {
        chosen = beta;
      }
    }

    if (chosen?.version && chosen.zxpUrl) {
      return NextResponse.json(
        {
          ...chosen,
          channel: chosen.channel ?? (/-beta/i.test(chosen.version) ? "beta" : "stable"),
          ffmpeg: chosen.ffmpeg ?? ffmpeg,
        },
        { headers: { "Cache-Control": "private, max-age=30" } },
      );
    }
  } catch (err) {
    console.error("[cep/update] R2 read failed", err);
  }

  return NextResponse.json(emptyManifest(ffmpeg), {
    status: 200,
    headers: { "Cache-Control": "private, max-age=30" },
  });
}
