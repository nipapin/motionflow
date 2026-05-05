import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";

const CACHE_DIR = path.join(process.cwd(), ".cache", "audio-peaks");

function cacheKey(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash + url.charCodeAt(i)) | 0;
  }
  return `peaks-${(hash >>> 0).toString(36)}`;
}

async function readCache(key: string): Promise<number[] | null> {
  try {
    const raw = await readFile(path.join(CACHE_DIR, `${key}.json`), "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {}
  return null;
}

async function writeCacheFile(key: string, peaks: number[]): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(peaks));
}

/** GET — return cached peaks or 404 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "missing url" }, { status: 400 });

  const cached = await readCache(cacheKey(url));
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "Cache-Control": "public, max-age=86400, immutable" },
    });
  }

  return NextResponse.json({ error: "not cached" }, { status: 404 });
}

/** POST — client sends computed peaks to be cached */
export async function POST(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "missing url" }, { status: 400 });

  try {
    const peaks: unknown = await req.json();
    if (!Array.isArray(peaks) || peaks.length === 0 || !peaks.every((v) => typeof v === "number")) {
      return NextResponse.json({ error: "invalid peaks" }, { status: 400 });
    }

    await writeCacheFile(cacheKey(url), peaks);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
}
