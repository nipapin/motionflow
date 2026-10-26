import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
let version: string | undefined;
export function analyticsLayoutVersion(): string {
  if (version) return version;
  let release = process.env.RELEASE_COMMIT || process.env.RELEASE_ID;
  if (!release) { try { release = JSON.parse(readFileSync(join(process.cwd(), "release.json"), "utf8")).commit; } catch { /* development checkout */ } }
  version = String(release || "market-v1").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "market-v1";
  return version;
}
