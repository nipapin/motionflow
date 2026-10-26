import { after, NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { extractPublicHostname } from "@/lib/auth/session";
import { isAffiliateAdmin } from "@/lib/affiliate/admin";
import { getRedis } from "@/lib/redis";
import { ingestTelemetry, pruneHeatmapData, telemetryBatchSchema } from "@/lib/market-analytics-ingest";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const fallbackLimits = new Map<string, { count: number; expires: number }>();
async function rateAllowed(req: NextRequest): Promise<boolean> {
  const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const key = createHash("sha256").update(ip).digest("hex").slice(0, 24);
  try {
    const redis = getRedis();
    const count = Number(await redis.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n", 1, `mf:analytics:${key}`));
    return count <= 40;
  } catch {
    const now = Date.now();
    if (fallbackLimits.size >= 10000) { for (const [k, value] of fallbackLimits) if (value.expires < now) fallbackLimits.delete(k); }
    if (fallbackLimits.size >= 10000 && !fallbackLimits.has(key)) return false;
    const entry = fallbackLimits.get(key);
    if (!entry || entry.expires < now) { fallbackLimits.set(key, { count: 1, expires: now + 60000 }); return true; }
    return ++entry.count <= 40;
  }
}
export async function POST(req: NextRequest) {
  if (process.env.MOTIONFLOW_MARKET_ANALYTICS === "0") return new NextResponse(null, { status: 204 });
  let origin: URL;
  try { origin = new URL(req.headers.get("origin") || ""); } catch { return new NextResponse(null, { status: 403 }); }
  if (origin.hostname !== extractPublicHostname(req) || req.headers.get("sec-fetch-site") === "cross-site") return new NextResponse(null, { status: 403 });
  if (Number(req.headers.get("content-length") || 0) > 24000) return new NextResponse(null, { status: 413 });
  const reader = req.body?.getReader();
  if (!reader) return new NextResponse(null, { status: 400 });
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 24000) { await reader.cancel(); return new NextResponse(null, { status: 413 }); }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return new NextResponse(null, { status: 400 }); }
  const parsed = telemetryBatchSchema.safeParse(raw);
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  if (!(await rateAllowed(req))) return new NextResponse(null, { status: 429 });
  try {
    const user = await getSessionUser();
    if (isAffiliateAdmin(user)) return new NextResponse(null, { status: 204 });
    const batch = parsed.data;
    if (process.env.MOTIONFLOW_HEATMAP === "0") { batch.heat = false; batch.cells = []; }
    await ingestTelemetry(batch, user?.id ?? null);
    after(async () => { try { await pruneHeatmapData(); } catch { console.error("[analytics] retention cleanup failed"); } });
    return new NextResponse(null, { status: 204 });
  } catch { return new NextResponse(null, { status: 503 }); }
}
