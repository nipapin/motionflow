import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSessionUser } from "@/lib/auth/get-session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const installers: Record<string, string> = {
  "SpunkramInstaller.exe": "application/octet-stream",
  "SpunkramInstaller-macOS.zip": "application/zip",
};

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const type = Object.hasOwn(installers, file) ? installers[file] : undefined;
  if (!type) return new Response(null, { status: 404 });
  if (!(await getSessionUser())) {
    return Response.json({ error: "Sign in to download the installer." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }
  const content = await readFile(path.join(process.cwd(), "private-assets", "spunkram", file));
  return new Response(content, { headers: {
    "Content-Type": type,
    "Content-Disposition": `attachment; filename="${file}"`,
    "Content-Length": String(content.length),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}
