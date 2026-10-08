// Use a separate PM2 daemon to validate real config recognition and Node flags.
import assert from "node:assert/strict";
import { mkdtempSync, copyFileSync, writeFileSync, readFileSync, existsSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
const root = mkdtempSync(join(tmpdir(), "motionflow-pm2-check-"));
const env = { ...process.env, PM2_HOME: join(root, "pm2-home") };
const pm2 = args => {
  const result = spawnSync("pm2", args, { env, encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout;
};
try {
  const config = join(root, "ecosystem.release.config.cjs");
  copyFileSync("deploy/ecosystem.release.config.cjs", config);
  writeFileSync(join(root, "release.json"), JSON.stringify({ releaseId: "fixture-release" }));
  writeFileSync(join(root, ".env"), "MOTIONFLOW_PM2_FIXTURE=loaded\n");
  writeFileSync(join(root, "server.mjs"), 'import {writeFileSync} from "node:fs"; writeFileSync("started.json",JSON.stringify({release:process.env.RELEASE_ID,env:process.env.MOTIONFLOW_PM2_FIXTURE})); setInterval(()=>{},1000);');
  pm2(["start", config, "--only", "motionflow"]);
  for (let i = 0; i < 30 && !existsSync(join(root, "started.json")); i++) await new Promise(r => setTimeout(r, 100));
  assert.deepEqual(JSON.parse(readFileSync(join(root, "started.json"), "utf8")), { release: "fixture-release", env: "loaded" });
  const processes = JSON.parse(pm2(["jlist"]));
  assert.equal(processes.length, 1);
  assert.equal(processes[0].name, "motionflow");
  assert.equal(processes[0].pm2_env.pm_exec_path, join(root, "server.mjs"));
  assert.equal(processes[0].pm2_env.pm_cwd, root);
  assert.equal(processes[0].pm2_env.status, "online");
  console.log("Real isolated PM2 check passed: config recognition, server executable, cwd, environment and release ID.");
} finally {
  pm2(["kill"]);
  assert.equal(dirname(realpathSync(root)), realpathSync(tmpdir()));
  rmSync(root, { recursive: true, force: true });
}
