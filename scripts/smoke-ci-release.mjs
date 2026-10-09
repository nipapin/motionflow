import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import assert from "node:assert/strict";
const { releaseId } = JSON.parse(readFileSync(".release/release.json", "utf8"));
const child = spawn(process.execPath, ["server.mjs"], { cwd: ".release", env: { ...process.env, NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: "3301", RELEASE_ID: releaseId, DB_PORT: "1", REDIS_PORT: "1" }, stdio: ["ignore", "pipe", "pipe"] });
let output = "";
child.stdout.on("data", d => { output = (output + d).slice(-5000); });
child.stderr.on("data", d => { output = (output + d).slice(-5000); });
try {
  let ready = false;
  for (let i = 0; i < 30; i++) {
    if (child.exitCode !== null) throw new Error("Packaged server exited\n" + output);
    try {
      const response = await fetch("http://127.0.0.1:3301/api/deploy-health", { signal: AbortSignal.timeout(8000) });
      const data = await response.json();
      assert.equal(response.status, 503);
      assert.equal(data.release, releaseId);
      assert.equal(data.database, false);
      assert.equal(data.redis, false);
      ready = true; break;
    } catch { await new Promise(r => setTimeout(r, 1000)); }
  }
  assert.ok(ready, "Packaged custom server failed readiness smoke test\n" + output);
  // Reproduce nginx's TLS termination on the loopback HTTP listener. A
  // loopback origin mismatch turns the rewrite into an external HTTPS proxy.
  for (const rsc of [false, true]) {
    const response = await fetch("http://127.0.0.1:3301/", {
      headers: {
        Host: "premieregal.motionflow.pro",
        "X-Forwarded-Host": "premieregal.motionflow.pro",
        "X-Forwarded-Proto": "https",
        ...(rsc ? { RSC: "1" } : {}),
      },
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, 200, "Premiere Gal HTTPS subdomain rewrite failed\n" + output);
    if (rsc) assert.match(response.headers.get("content-type") ?? "", /text\/x-component/);
    assert.ok((await response.text()).includes("Gal Toolkit MAX"), "Premiere Gal storefront was not rendered\n" + output);
  }
  // Auth-less upgrade must still reach the Adobe WebSocket hub after packaging.
  const { default: WebSocket } = await import("ws");
  await new Promise((resolve, reject) => {
    const socket = new WebSocket("ws://127.0.0.1:3301/api/cep/ws", { handshakeTimeout: 5000 });
    socket.once("open", () => { socket.close(); resolve(); });
    socket.once("error", reject);
  });
  console.log("Linux runtime smoke passed: custom server, readiness, Premiere Gal HTTPS rewrites, Adobe WebSocket upgrade.");
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "exit");
    const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
    child.kill("SIGTERM");
    await exited;
    clearTimeout(timer);
  }
}
