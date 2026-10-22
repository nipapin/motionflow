import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";

const source = readFileSync(new URL("../lib/jumpcut-analysis.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
vm.runInNewContext(code, { exports });
const words = [{ type: "word", text: "Important", start: 2, end: 3 }, { type: "spacing", text: " ", start: 3, end: 3 },
  { type: "word", text: "takeaway", start: 3, end: 4 }, { type: "word", text: "here.", start: 4, end: 5 }];

test("AI selects word IDs while text and timestamps come exclusively from ASR", async () => {
  const result = await exports.analyzeZoomPhrases(words, "medium", async () => '[{"first":0,"last":1}]');
  assert.deepEqual(JSON.parse(JSON.stringify(result)), [{ text: "Important takeaway", start: 2, end: 4 }]);
});
test("hallucinated IDs, malformed output and overlapping phrases are rejected", async () => {
  for (const output of ['[{"first":0,"last":99}]', '[{"first":1.5,"last":2}]', '{}', 'not JSON', '[{"first":0,"last":1},{"first":1,"last":2}]']) {
    await assert.rejects(exports.analyzeZoomPhrases(words, "low", async () => output));
  }
});
test("no key phrases is a valid AI answer; all batches are processed", async () => {
  let calls = 0;
  const many = Array.from({ length: 501 }, (_, i) => ({ type: "word", text: "word", start: i, end: i + .5 }));
  const result = await exports.analyzeZoomPhrases(many, "high", async (system) => { calls++; assert.match(system, /untrusted/); return '[]'; });
  assert.equal(calls, 2); assert.equal(result.length, 0);
});
test("oversized transcripts are rejected before model calls", async () => {
  let called = false;
  await assert.rejects(exports.analyzeZoomPhrases([{ text: "x".repeat(40001), start: 0, end: 1 }], "low", async () => { called = true; return '[]'; }), /too long/);
  assert.equal(called, false);
});
