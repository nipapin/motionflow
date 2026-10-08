import { existsSync, readdirSync, realpathSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
const root = resolve(process.argv[2]);
if (root !== "/root/motionflow-deploy") throw new Error("Unexpected deployment root");
const keep = new Set(["current", "previous"].filter(p => existsSync(join(root, p))).map(p => realpathSync(join(root, p))));
for (const category of ["releases", "incoming"]) {
  const parent = join(root, category);
  const entries = readdirSync(parent, { withFileTypes: true }).filter(e => e.isDirectory() && /^(?:\.staging-)?[a-f0-9]{40}-\d+-\d+(?:-[A-Za-z0-9]+)?$/.test(e.name)).map(e => join(parent, e.name)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  for (const path of entries.slice(3)) {
    if (keep.has(realpathSync(path)) || keep.has(join(root, "releases", path.split("/").at(-1)))) continue;
    rmSync(path, { recursive: true });
  }
}
