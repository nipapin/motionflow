import { existsSync, readdirSync, readFileSync, readlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { join, dirname, resolve, sep } from "node:path";
const manifest = JSON.parse(readFileSync("release.json", "utf8"));
if (manifest.releaseId !== process.argv[2] || manifest.platform !== process.platform || manifest.arch !== process.arch || manifest.nodeMajor !== Number(process.versions.node.split(".")[0])) throw new Error("Release identity or runtime mismatch");
for (const file of [".next/BUILD_ID", "server.mjs", "server/cep-ws-hub.mjs", "server/deploy-health.mjs", "public", "db/migrations", "ecosystem.release.config.cjs"]) if (!existsSync(file)) throw new Error(`Missing ${file}`);
function check(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (/^\.env(?:\.|$)/.test(entry.name)) throw new Error("Environment file in release");
    if (entry.isSymbolicLink()) {
      const file = join(root, entry.name), target = resolve(dirname(file), readlinkSync(file));
      if (!target.startsWith(process.cwd() + sep) || !existsSync(file)) throw new Error('External or missing runtime link');
    }
    if (entry.isDirectory()) check(join(root, entry.name));
  }
}
check(".");
const require = createRequire(join(process.cwd(), "server.mjs"));
for (const module of ["next", "mysql2/promise", "ioredis", "ws", "sharp"]) require(module);
console.log(`Verified ${manifest.releaseId}`);
