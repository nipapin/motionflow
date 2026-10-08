// Exercise activation and rollback without changing any real PM2 process.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
if (process.platform !== "linux") {
  console.log("Installer rollback fixtures run on Linux in CI.");
  process.exit(0);
}
const repo = process.cwd(), temporary = mkdtempSync(join(tmpdir(), "motionflow-installer-"));
const write = (file, text, mode) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text, { mode }); };
try {
  const root = join(temporary, "deploy"), legacy = join(temporary, "legacy"), bin = join(temporary, "bin");
  const state = join(temporary, "pm2.json"), log = join(temporary, "operations.log");
  write(join(legacy, ".env"), "AUTH_SECRET=fixture-only\n");
  write(join(legacy, "ecosystem.config.cjs"), "module.exports={apps:[]};");
  write(state, JSON.stringify({ release: "legacy" }));
  write(log, "");
  write(join(bin, "pm2"), `#!/usr/bin/env node
const fs=require('fs'),path=require('path');
const [action,config]=process.argv.slice(2);
fs.appendFileSync(process.env.MOCK_LOG,action+':'+(config||'')+'\\n');
let state=JSON.parse(fs.readFileSync(process.env.MOCK_STATE));
if(action==='describe')process.exit(state.release==='stopped'?1:0);
if(action==='delete')state={release:'stopped'};
if(action==='start')state={release:config.endsWith('ecosystem.release.cjs')?JSON.parse(fs.readFileSync(path.join(path.dirname(config),'release.json'))).releaseId:'legacy'};
fs.writeFileSync(process.env.MOCK_STATE,JSON.stringify(state));
`, 0o755);
  write(join(bin, "curl"), `#!/usr/bin/env node
const fs=require('fs');const {release}=JSON.parse(fs.readFileSync(process.env.MOCK_STATE));
if(process.env.MOCK_FAIL_RELEASE===release)process.exit(22);
process.stdout.write(JSON.stringify({status:'ok',release,database:true,redis:true}));
`, 0o755);
  write(join(bin, "sleep"), "#!/bin/sh\nexit 0\n", 0o755);
  const installer = join(temporary, "install.sh");
  write(installer, readFileSync("deploy/install-release.sh", "utf8").replace("root=/root/motionflow-deploy", `root=${root}`).replace("legacy=/var/www/motionflow_p_usr/data/www/next.motionflow.pro", `legacy=${legacy}`));
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, MOCK_STATE: state, MOCK_LOG: log };
  const commit = "a".repeat(40), id = n => `${commit}-${n}-1`;
  function archive(n) {
    const source = join(temporary, `source-${n}`), incoming = join(root, "incoming", id(n));
    mkdirSync(incoming, { recursive: true });
    for (const file of [".next/BUILD_ID", "server.mjs", "server/cep-ws-hub.mjs", "server/deploy-health.mjs", "ecosystem.release.cjs", "public/asset.txt", "db/migrations/test.sql"]) write(join(source, file), "fixture");
    for (const module of ["next", "mysql2/promise", "ioredis", "ws", "sharp"]) write(join(source, "node_modules", module, "index.js"), "module.exports={};");
    write(join(source, "release.json"), JSON.stringify({ releaseId: id(n), commit, platform: "linux", arch: "x64", nodeMajor: 20 }));
    for (const script of ["verify-ci-release.mjs", "check-ci-health.mjs", "prune-ci-releases.mjs"]) write(join(source, "scripts", script), readFileSync(join(repo, "scripts", script), "utf8"));
    const target = join(incoming, "motionflow.tgz");
    assert.equal(spawnSync("tar", ["-czf", target, "-C", source, "."]).status, 0);
    write(target + ".sha256", createHash("sha256").update(readFileSync(target)).digest("hex") + "  motionflow.tgz\n");
    return target;
  }
  const install = (n, extra={}) => spawnSync("bash", [installer, id(n)], { env: { ...env, ...extra }, encoding: "utf8", timeout: 30000 });
  archive(1);
  let result = install(1, { MOCK_FAIL_RELEASE: id(1) });
  assert.notEqual(result.status, 0);
  assert.equal(JSON.parse(readFileSync(state)).release, "legacy");
  assert.equal(existsSync(join(root, "current")), false);
  archive(2);
  result = install(2);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const current = realpathSync(join(root, "current"));
  assert.equal(JSON.parse(readFileSync(state)).release, id(2));
  assert.equal(realpathSync(join(current, ".env")), realpathSync(join(legacy, ".env")));
  archive(3);
  result = install(3, { MOCK_FAIL_RELEASE: id(3) });
  assert.notEqual(result.status, 0);
  assert.equal(realpathSync(join(root, "current")), current);
  assert.equal(JSON.parse(readFileSync(state)).release, id(2));
  const corrupt = archive(4);
  writeFileSync(corrupt, "corrupt archive");
  const before = readFileSync(log, "utf8");
  assert.notEqual(install(4).status, 0);
  assert.equal(readFileSync(log, "utf8"), before);
  assert.equal(realpathSync(join(root, "current")), current);
  console.log("Installer fixtures passed: legacy rollback, activation, release rollback, checksum, shared environment.");
} finally {
  assert.equal(dirname(realpathSync(temporary)), realpathSync(tmpdir()));
  rmSync(temporary, { recursive: true, force: true });
}
