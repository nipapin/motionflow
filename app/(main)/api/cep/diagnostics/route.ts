import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { cepClientIp, resolveCepBearerUser } from "@/lib/cep-auth";
import { MAX_DIAGNOSTIC_BYTES, parseCepDiagnostic, storeCepDiagnostic } from "@/lib/cep-diagnostics";

export const runtime = "nodejs";
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Cache-Control": "no-store" };
const limits = new Map<string, { count: number; until: number }>();
function rateAllowed(req: NextRequest) {
  const now = Date.now();
  if (limits.size >= 5000) for (const [key, value] of limits) if (value.until < now) limits.delete(key);
  const key = createHash("sha256").update(cepClientIp(req.headers) || "unknown").digest("hex");
  if (!limits.has(key) && limits.size >= 5000) return false;
  const value = limits.get(key);
  if (!value || value.until < now) { limits.set(key, { count: 1, until: now + 60000 }); return true; }
  return ++value.count <= 90;
}
function reply(body: unknown, status: number) { return NextResponse.json(body, { status, headers }); }
export function OPTIONS() { return new NextResponse(null, { status: 204, headers }); }

export async function POST(req: NextRequest) {
  if (!rateAllowed(req)) return reply({ error: "Too many reports" }, 429);
  if (Number(req.headers.get("content-length")) > MAX_DIAGNOSTIC_BYTES) return reply({ error: "Report too large" }, 413);
  const reader = req.body?.getReader();
  if (!reader) return reply({ error: "Expected a JSON report" }, 400);
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_DIAGNOSTIC_BYTES) { await reader.cancel(); return reply({ error: "Report too large" }, 413); }
      chunks.push(value);
    }
    let raw: unknown;
    try { raw = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { return reply({ error: "Invalid JSON" }, 400); }
    const report = parseCepDiagnostic(raw);
    if (!report) return reply({ error: "Invalid diagnostic report" }, 400);
    // Legacy Gal panels have no CEP bearer token: keep their identity explicitly self-reported.
    const bearer = req.headers.get("authorization");
    const user = bearer ? await resolveCepBearerUser(bearer) : null;
    await storeCepDiagnostic(report, user?.id || null);
    return reply({ ok: true, reportId: report.reportId }, 202);
  } catch (error) {
    console.error("[cep/diagnostics] Could not persist report", error instanceof Error ? error.message : "unknown error");
    return reply({ error: "Could not save the report; retry later" }, 503);
  }
}
