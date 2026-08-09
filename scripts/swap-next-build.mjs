/**
 * Atomically replace `.next` with a finished `.next-build` so `next build`
 * never mutates the directory the live PM2 process is serving.
 */
import { existsSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const live = join(root, ".next");
const staged = join(root, ".next-build");
const backup = join(root, ".next-old");

if (!existsSync(staged)) {
  console.error("[swap-next-build] Missing .next-build — run: npm run build:staging");
  process.exit(1);
}

rmSync(backup, { recursive: true, force: true });
if (existsSync(live)) {
  renameSync(live, backup);
}
renameSync(staged, live);
rmSync(backup, { recursive: true, force: true });

console.log("[swap-next-build] Swapped .next-build → .next");
