import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Readable } from "node:stream";
import ts from "typescript";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const require = createRequire(import.meta.url);
function load(relative, mocks) {
  const source = ts.transpileModule(readFileSync(new URL(`../${relative}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", source)(name => name in mocks ? mocks[name] : require(name), module, module.exports);
  return module.exports;
}
const archive = Buffer.from("signed ZXP test fixture");
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const metadata = (product = "spunkram", version = "1.2.3") => ({ product, version, channel: version.includes("beta") ? "beta" : "stable", size: archive.length, sha256: digest(archive), changelog: "notes" });

function fixture() {
  const records = new Map(), objects = new Map(), commands = [], notifications = [], presigned = [];
  let failPointer = false;
  const redis = {
    async ping() { return "PONG"; },
    async get(key) { return records.get(key) ?? null; },
    async set(key, value, ...args) { if (args.includes("NX") && records.has(key)) return null; records.set(key, value); return "OK"; },
    async eval(_, __, key, owner) { if (records.get(key) === owner) records.delete(key); return 1; },
  };
  const client = { async send(command) {
    commands.push(command);
    const input = command.input, key = `${input.Bucket}/${input.Key}`;
    const name = command.constructor.name;
    if (name === "GetObjectCommand" || name === "HeadObjectCommand") {
      const obj = objects.get(key);
      if (!obj) throw { $metadata: { httpStatusCode: 404 } };
      const body = Readable.from([obj.bytes]);
      body.transformToString = async () => obj.bytes.toString();
      return { Body: body, ETag: obj.etag || "snapshot-etag", ContentLength: obj.bytes.length, Metadata: obj.metadata || {} };
    }
    if (name === "CopyObjectCommand") {
      assert.equal(input.CopySourceIfMatch, "snapshot-etag");
      const src = objects.get(input.CopySource);
      objects.set(key, { bytes: src.bytes, metadata: input.Metadata });
      return {};
    }
    if (name === "PutObjectCommand") {
      if (failPointer) { failPointer = false; throw new Error("pointer temporarily unavailable"); }
      objects.set(key, { bytes: input.Body }); return {};
    }
    if (name === "DeleteObjectCommand") { objects.delete(key); return {}; }
    assert.fail(`Unexpected command ${name}`);
  } };
  const mocks = {
    "server-only": {}, "@/lib/redis": { getRedis: () => redis },
    "@/lib/r2-storage": { getR2Client: () => client, getR2UploadSigningClient: () => client, getR2Bucket: () => "public", getR2PrivateBucket: () => "private", r2PublicUrlForKey: key => `https://cdn.example.test/${key}` },
    "@aws-sdk/s3-request-presigner": { getSignedUrl: async (_, command, options) => { presigned.push({ command, options }); return "https://private.account.r2.cloudflarestorage.com/upload?X-Amz-Signature=test"; } },
    "@/lib/cep-events": { publishCepExtensionUpdate: async payload => { notifications.push(payload); return true; } },
  };
  mocks["@/lib/spunkram-release"] = load("lib/spunkram-release.ts", mocks);
  const api = load("lib/cep-release-api.ts", mocks);
  const handlers = load("app/(main)/api/cep/releases/route.ts", { "@/lib/cep-release-api": api });
  const post = (body, token = "test-secret") => handlers.POST(new Request("https://motionflow.pro/api/cep/releases", {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
  }));
  const owner = api.releaseIdentity(new Headers({ Authorization: "Bearer test-secret" }));
  async function prepare(input = metadata(), bytes = archive) {
    const response = await post({ action: "prepare", ...input });
    assert.equal(response.status, 200);
    const prepared = await response.json();
    const receipt = JSON.parse(records.get(`cep:release:upload:${prepared.uploadId}`));
    objects.set(`${receipt.stagingBucket}/${receipt.stagingKey}`, { bytes });
    return { ...prepared, receipt };
  }
  return { api, handlers, owner, records, objects, commands, notifications, presigned, post, prepare, failPointer() { failPointer = true; } };
}

// Real route + actual storage/publication functions. All external infrastructure
// is replaced; no production object, pointer, Redis key or notification is touched.
process.env.CEP_RELEASE_TOKEN = "test-secret";

test("actual SDK presigning binds size/type without signing the checksum of an empty body", async () => {
  const original = Object.fromEntries(["R2_REGION", "R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"].map(key => [key, process.env[key]]));
  Object.assign(process.env, { R2_REGION: "auto", R2_ENDPOINT: "https://example.r2.cloudflarestorage.com", R2_ACCESS_KEY_ID: "fixture", R2_SECRET_ACCESS_KEY: "fixture" });
  try {
    const storage = load("lib/r2-storage.ts", { "server-only": {} });
    const url = new URL(await getSignedUrl(storage.getR2UploadSigningClient(), new PutObjectCommand({ Bucket: "fixture", Key: "upload", ContentType: "application/octet-stream", ContentLength: 123 }), { expiresIn: 3600, signableHeaders: new Set(["content-type"]) }));
    assert.equal(url.searchParams.has("x-amz-checksum-crc32"), false);
    assert.equal(url.searchParams.has("x-amz-sdk-checksum-algorithm"), false);
    assert.match(url.searchParams.get("X-Amz-SignedHeaders"), /content-length/);
    assert.match(url.searchParams.get("X-Amz-SignedHeaders"), /content-type/);
  } finally {
    for (const [key, value] of Object.entries(original)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test("release API rejects missing/wrong/CEP user credentials before storage; checks capabilities with valid token", async () => {
  const f = fixture();
  for (const token of ["", "wrong", "mfcep_ordinary-user"]) {
    const response = await f.handlers.GET(new Request("https://motionflow.pro/api/cep/releases", { headers: { Authorization: `Bearer ${token}` } }));
    assert.equal(response.status, 401);
    assert.equal(f.commands.length, 0);
  }
  const ok = await f.handlers.GET(new Request("https://motionflow.pro/api/cep/releases", { headers: { Authorization: "Bearer test-secret" } }));
  assert.equal(ok.headers.get("cache-control"), "no-store");
  assert.deepEqual((await ok.json()).products, ["spunkram", "gal", "odin"]);
});

test("each product/channel streams and verifies the archive before immutable copy, pointer update and WS notification", async () => {
  for (const product of ["spunkram", "gal", "odin"]) for (const channel of ["stable", "beta"]) {
    const f = fixture(), input = metadata(product, `1.2.3${channel === "beta" ? "-beta.1" : ""}`);
    const prepared = await f.prepare(input);
    assert.equal(f.presigned[0].command.input.ContentLength, archive.length);
    assert.equal(f.presigned[0].options.expiresIn, 3600);
    assert.ok(f.presigned[0].options.signableHeaders.has("content-type"));
    const response = await f.post({ action: "publish", uploadId: prepared.uploadId });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.manifest.product, product);
    assert.equal(result.manifest.channel, channel);
    assert.equal(result.manifest.sha256, digest(archive));
    const folder = `public/public/downloads/${product}`;
    assert.deepEqual(f.objects.get(`${folder}/${input.version}/${product}.zxp`).bytes, archive);
    assert.equal(JSON.parse(f.objects.get(`${folder}/${channel === "beta" ? "beta" : "latest"}.json`).bytes).version, input.version);
    assert.equal(f.notifications.length, 1);
    assert.equal(f.notifications[0].product, product);
    assert.equal(f.objects.has(`private/${prepared.receipt.stagingKey}`), false);
    const calls = f.commands.length;
    const again = await f.post({ action: "publish", uploadId: prepared.uploadId });
    assert.equal((await again.json()).alreadyPublished, true);
    assert.equal(f.commands.length, calls);
    assert.equal(f.notifications.length, 1);
  }
});

test("invalid product/path/version/channel/size/hash/changelog never creates an upload capability", async () => {
  const f = fixture();
  for (const invalid of [{ product: "../gal" }, { version: "../1.0.0" }, { version: "1.0.0-rc.1" }, { channel: "beta" }, { size: 0 }, { size: 513 * 1024 * 1024 }, { sha256: "wrong" }, { changelog: "x".repeat(24001) }]) {
    assert.equal((await f.post({ action: "prepare", ...metadata(), ...invalid })).status, 400);
  }
  assert.equal(f.presigned.length, 0);
});

test("size/hash mismatch leaves previous release untouched and does not send WS", async () => {
  for (const bytes of [Buffer.from("short"), Buffer.alloc(archive.length, 1)]) {
    const f = fixture();
    const prepared = await f.prepare(metadata(), bytes);
    const response = await f.post({ action: "publish", uploadId: prepared.uploadId });
    assert.equal(response.status, 422);
    assert.ok(!f.commands.some(command => ["CopyObjectCommand", "PutObjectCommand"].includes(command.constructor.name)));
    assert.equal(f.notifications.length, 0);
  }
});

test("published versions cannot be overwritten with different bytes and channel pointers cannot downgrade", async () => {
  for (const conflict of ["different-bytes", "newer-pointer"]) {
    const f = fixture();
    const prepared = await f.prepare();
    if (conflict === "different-bytes") f.objects.set("public/public/downloads/spunkram/1.2.3/spunkram.zxp", { bytes: Buffer.from("old release") });
    else f.objects.set("public/public/downloads/spunkram/latest.json", { bytes: Buffer.from(JSON.stringify({ version: "9.0.0" })) });
    assert.equal((await f.post({ action: "publish", uploadId: prepared.uploadId })).status, 409);
    assert.ok(!f.commands.some(command => ["CopyObjectCommand", "PutObjectCommand"].includes(command.constructor.name)));
  }
});

test("pointer failure is recoverable using the same receipt; verified existing ZXP is reused", async () => {
  const f = fixture(), prepared = await f.prepare();
  f.failPointer();
  await assert.rejects(f.api.finalizeRelease(prepared.uploadId, f.owner), /pointer temporarily/);
  assert.equal(f.notifications.length, 0);
  const recovered = await f.api.finalizeRelease(prepared.uploadId, f.owner);
  assert.equal(recovered.manifest.version, "1.2.3");
  assert.equal(f.commands.filter(command => command.constructor.name === "CopyObjectCommand").length, 1);
});

test("expired, foreign or concurrently publishing receipts cannot modify publication", async () => {
  const f = fixture(), prepared = await f.prepare();
  await assert.rejects(f.api.finalizeRelease(prepared.uploadId, "another-owner"), error => error.status === 403);
  f.records.set("cep:release:lock:spunkram:stable", "another-upload");
  await assert.rejects(f.api.finalizeRelease(prepared.uploadId, f.owner), error => error.status === 409);
  assert.equal(f.records.get("cep:release:lock:spunkram:stable"), "another-upload");
  f.records.delete(`cep:release:upload:${prepared.uploadId}`);
  await assert.rejects(f.api.finalizeRelease(prepared.uploadId, f.owner), error => error.status === 410);
  assert.equal(f.commands.length, 0);
});
