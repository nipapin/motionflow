import { NextResponse } from "next/server";
import { releaseCapabilities, releaseIdentity, prepareRelease, finalizeRelease, validateReleaseInput, ReleaseError } from "@/lib/cep-release-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 240;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
function failure(error: unknown) {
  if (error instanceof ReleaseError) return json({ error: error.message }, error.status);
  console.error("[cep-release]", error);
  return json({ error: "Release service failed; retry or check server configuration" }, 503);
}

/** Credentials and storage preflight, before local version/build/Git mutations. */
export async function GET(req: Request) {
  try { releaseIdentity(req.headers); return json(await releaseCapabilities()); }
  catch (error) { return failure(error); }
}

/** Small control JSON only. The archive goes directly to a scoped R2 PUT URL. */
export async function POST(req: Request) {
  try {
    const owner = releaseIdentity(req.headers);
    if (Number(req.headers.get("content-length")) > 65536) throw new ReleaseError("Request too large", 413);
    const raw = await req.text();
    if (raw.length > 65536) throw new ReleaseError("Request too large", 413);
    let body;
    try { body = JSON.parse(raw); } catch { throw new ReleaseError("Invalid JSON"); }
    if (body?.action === "prepare") return json(await prepareRelease(validateReleaseInput(body), owner));
    if (body?.action === "publish" && typeof body.uploadId === "string") return json(await finalizeRelease(body.uploadId, owner));
    throw new ReleaseError("Expected action prepare or publish");
  } catch (error) { return failure(error); }
}
