import assert from "node:assert/strict";
import { test } from "node:test";
import { createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);

// Run the actual route handlers with publication, auth and HTTP mocked.
// No environment files, databases, R2 writes or production requests are used.
function route(relative, mocks, fetchMock = () => assert.fail("Unexpected HTTP request")) {
  const source = ts.transpileModule(readFileSync(path.join(root, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", "fetch", source)(
    name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), module, module.exports, fetchMock,
  );
  return module.exports;
}

test("uploader dry-run keeps all three products and stable/beta pointers isolated", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "cep-zxp-test-"));
  const zxp = path.join(directory, "sample.zxp");
  writeFileSync(zxp, "test archive");
  try {
    for (const product of ["spunkram", "gal", "odin"]) {
      for (const channel of ["stable", "beta"]) {
        const version = `1.2.3${channel === "beta" ? "-beta.1" : ""}`;
        const result = spawnSync(process.execPath, ["scripts/upload-spunkram-zxp.mjs", `--product=${product}`, `--zxp=${zxp}`, `--version=${version}`, "--dry-run"], {
          cwd: root, encoding: "utf8", env: { ...process.env, R2_PUBLIC_CDN: "https://cdn.example.test" },
        });
        assert.equal(result.status, 0, result.stderr);
        const manifest = JSON.parse(result.stdout.slice(result.stdout.indexOf("{")));
        assert.equal(manifest.product, product);
        assert.equal(manifest.channel, channel);
        assert.equal(manifest.version, version);
        assert.equal(manifest.zxpUrl, `https://cdn.example.test/public/downloads/${product}/${version}/${product}.zxp`);
        assert.ok(result.stdout.includes(`public/downloads/${product}/${channel === "beta" ? "beta" : "latest"}.json`));
      }
    }
    const invalid = spawnSync(process.execPath, ["scripts/upload-spunkram-zxp.mjs", "--product=unknown", `--zxp=${zxp}`, "--version=1.0.0", "--dry-run"], { cwd: root, encoding: "utf8" });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /Invalid --product/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("release notify preserves the Odin product for event filtering", async () => {
  const original = process.env.MOTIONFLOW_ADMIN_API_SECRET;
  process.env.MOTIONFLOW_ADMIN_API_SECRET = "test-admin-secret";
  try {
    const events = [];
    const { POST } = route("app/(main)/api/cep/update/notify/route.ts", {
      "@/lib/cep-events": { publishCepExtensionUpdate: async event => { events.push(event); return true; } },
      "@/lib/auth/resolve-captions-user": { requireCaptionsAuth: () => assert.fail("Admin secret should authenticate") },
    });
    for (const product of ["spunkram", "gal", "odin"]) {
      const response = await POST(new Request("https://example.test/api/cep/update/notify", {
        method: "POST", headers: { "Content-Type": "application/json", "x-motionflow-admin-secret": "test-admin-secret" },
        body: JSON.stringify({ product, version: "1.0.0", zxpUrl: `https://cdn.example.test/${product}.zxp` }),
      }));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).product, product);
      assert.equal(events.at(-1).product, product);
    }
  } finally {
    if (original === undefined) delete process.env.MOTIONFLOW_ADMIN_API_SECRET;
    else process.env.MOTIONFLOW_ADMIN_API_SECRET = original;
  }
});

test("GitHub releases select the tagged brand's ZXP and strip its prefix from the version", async () => {
  const original = process.env.GITHUB_WEBHOOK_SECRET;
  process.env.GITHUB_WEBHOOK_SECRET = "test-webhook-secret";
  try {
    const publications = [], downloads = [];
    const { POST } = route("app/(main)/api/github/webhook/route.ts", {
      "@/lib/spunkram-release": { publishCepProductZxp: async release => {
        publications.push(release);
        return { version: release.version, zxpUrl: `https://cdn.example.test/${release.product}.zxp` };
      } },
    }, async url => { downloads.push(url); return new Response("test archive"); });
    const send = (tag, assets, signature = null) => {
      const body = JSON.stringify({ action: "published", repository: { full_name: process.env.GITHUB_SPUNKRAM_REPO || "test/cep" }, release: { tag_name: tag, assets } });
      return POST(new Request("https://example.test/api/github/webhook", {
        method: "POST", body, headers: { "x-github-event": "release", "x-hub-signature-256": signature || `sha256=${createHmac("sha256", "test-webhook-secret").update(body).digest("hex")}` },
      }));
    };
    const assets = ["com.spunkramlibrary.cep", "com.premieregal.cep", "com.odinpro.cep"].map(id => ({ name: `${id}.zxp`, browser_download_url: `https://github.example.test/${id}.zxp` }));
    for (const [product, id] of [["spunkram", "com.spunkramlibrary.cep"], ["gal", "com.premieregal.cep"], ["odin", "com.odinpro.cep"]]) {
      for (const version of ["1.2.3", "1.2.4-beta.2"]) {
        const response = await send(`${product}-${version}`, assets);
        assert.equal(response.status, 200);
        assert.equal((await response.json()).product, product);
        assert.equal(publications.at(-1).product, product);
        assert.equal(publications.at(-1).version, version);
        assert.equal(publications.at(-1).channel, version.includes("beta") ? "beta" : "stable");
        assert.equal(downloads.at(-1), `https://github.example.test/${id}.zxp`);
      }
    }
    await send("v1.2.3", assets);
    assert.equal(publications.at(-1).product, "spunkram");
    assert.equal(publications.at(-1).version, "1.2.3");
    const count = publications.length;
    assert.equal((await (await send("odin-1.0.0", [assets[0]])).json()).skipped, "no_zxp_asset");
    assert.equal((await (await send("unknown-1.0.0", assets)).json()).skipped, "invalid_tag");
    assert.equal((await send("odin-1.0.0", assets, "sha256=00")).status, 401);
    assert.equal(publications.length, count);
  } finally {
    if (original === undefined) delete process.env.GITHUB_WEBHOOK_SECRET;
    else process.env.GITHUB_WEBHOOK_SECRET = original;
  }
});
