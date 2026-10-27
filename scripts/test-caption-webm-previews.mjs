import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function catalog(keys) {
  const exports = {};
  class Command { constructor(input) { this.input = input; } }
  const imports = { "server-only": {}, "@aws-sdk/client-s3": { GetObjectCommand: Command, HeadObjectCommand: Command, ListObjectsV2Command: Command },
    "@/lib/r2-storage": { getR2Bucket: () => "public", getR2PrivateBucket: () => "public",
      getR2Client: () => ({ send: async () => ({ Contents: keys.map(Key => ({ Key })) }) }),
      r2PublicUrlForKey: key => "https://cdn.example.test/" + key.split("/").map(encodeURIComponent).join("/") } };
  const code = ts.transpileModule(readFileSync(new URL("../lib/captions-catalog.ts", import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, { exports, require: name => { if (!(name in imports)) throw Error(name); return imports[name]; } });
  return exports;
}

test("R2 catalog prefers WebM regardless of listing order and retains MP4-only captions", async () => {
  const prefix = "Spunkram Captions/Expressive/";
  const keys = ["Both/preview.webm", "Both/preview.mp4", "Legacy/preview.mp4", "Webm/preview.webm"];
  for (const order of [keys, [...keys].reverse()]) {
    const api = catalog(order.map(key => prefix + key));
    const tree = await api.buildCaptionsTree("spunkram");
    assert.deepEqual(Array.from(tree.categories[0].captions, c => c.previewVideoUrl.split("/").at(-1)), ["preview.webm", "preview.mp4", "preview.webm"]);
  }
});

test("public media accepts WebM with correct MIME and still rejects protected files", () => {
  const api = catalog([]);
  assert.equal(api.mimeForFilename("preview.webm"), "video/webm");
  assert.equal(api.resolvePreviewMediaUrl("spunkram", "Expressive/Expressive Caption 1/preview.webm"),
    "https://cdn.example.test/Spunkram%20Captions/Expressive/Expressive%20Caption%201/preview.webm");
  assert.equal(api.resolvePreviewMediaUrl("spunkram", "Expressive/Caption/master.aep"), null);
});
