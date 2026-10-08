import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
const releaseId = process.env.RELEASE_ID, commit = process.env.RELEASE_COMMIT;
if (process.platform !== "linux" || process.arch !== "x64" || !/^[a-f0-9]{40}-\d+-\d+$/.test(releaseId) || !releaseId.startsWith(commit + "-")) throw new Error("Invalid Linux release metadata");
if (!existsSync(".next/BUILD_ID") || existsSync(".release")) throw new Error("Build missing or release directory exists");
mkdirSync(".release");
// Preserve the custom WebSocket server: Next standalone cannot replace it.
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
for (const file of files) {
  if (file.split("/").some(p => /^\.env(?:\.|$)/.test(p))) continue;
  cpSync(file, join(".release", file), { recursive: true });
}
cpSync(".next", ".release/.next", { recursive: true, verbatimSymlinks: true, filter: p => !p.replaceAll("\\", "/").startsWith(".next/cache") });
cpSync("node_modules", ".release/node_modules", { recursive: true, verbatimSymlinks: true });
cpSync("deploy/ecosystem.release.config.cjs", ".release/ecosystem.release.config.cjs");
writeFileSync(".release/release.json", JSON.stringify({ releaseId, commit, platform: process.platform, arch: process.arch, nodeMajor: Number(process.versions.node.split(".")[0]) }));
function check(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (/^\.env(?:\.|$)/.test(entry.name)) throw new Error("Environment file in release");
    if (entry.isDirectory()) check(join(root, entry.name));
  }
}
check(".release");
console.log(`Packaged ${releaseId} with custom server and production dependencies.`);
