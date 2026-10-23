import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";

function load(file, imports = {}) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => { if (!(name in imports)) throw Error(name); return imports[name]; },
    process: { env: { REPLICATE_API_TOKEN: "test-only" } } });
  return exports;
}
const analysis = load("../lib/caption-highlights.ts");
const plain = value => JSON.parse(JSON.stringify(value));

test("semantic analysis uses indices, supports repeated words and one contiguous phrase per segment", async () => {
  const segments = [["this", "word", "stays", "highlighted"], ["same", "same"]];
  const result = await analysis.analyzeCaptionHighlights(segments, async system => {
    assert.match(system, /untrusted/);
    return '[{"segment":0,"index":2,"length":2},{"segment":1,"index":1,"length":1}]';
  });
  assert.deepEqual(plain(result), [{ segment: 0, index: 2, length: 2 }, { segment: 1, index: 1, length: 1 }]);
});
test("missing, duplicate, fractional and hallucinated model indices are rejected", () => {
  for (const result of ['[]', '{}', '[{"segment":0,"index":0,"length":3}]', '[{"segment":0,"index":0.5,"length":1}]',
    '[{"segment":0,"index":0,"length":1},{"segment":0,"index":0,"length":1}]']) {
    assert.throws(() => analysis.parseHighlightRanges(result, [["one", "two"]]));
  }
});
test("all batches retain global segment IDs; no emphasis is valid", async () => {
  let calls = 0;
  const result = await analysis.analyzeCaptionHighlights(Array.from({ length: 51 }, () => ["and"]), async (_system, prompt) => {
    calls++; return JSON.stringify(JSON.parse(prompt).segments.map(s => ({ segment: s.segment, index: 0, length: 0 })));
  });
  assert.equal(calls, 2); assert.equal(result.length, 51); assert.equal(result[50].segment, 50);
});
test("oversized or invalid input is rejected before model work", () => {
  for (const input of [null, [], [[""]], [[4]], Array.from({ length: 1201 }, () => ["a"]),
    Array.from({ length: 41 }, () => ["a".repeat(1000)])]) assert.throws(() => analysis.validateHighlightSegments(input));
});

function route({ left = 3, authenticated = true, valid = true, consumeOk = true } = {}) {
  let models = 0, charges = [];
  const mod = load("../app/(main)/api/generations/caption-highlights/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    replicate: { default: class { async run() { models++; if (!valid) return 'bad'; return '[{"segment":0,"index":0,"length":1}]'; } } },
    "@/lib/auth/resolve-captions-user": { bearerFromRequest: () => "Bearer test", requireCaptionsAuth: async () => authenticated
      ? { ok: true, user: { id: 7 } } : { ok: false, response: { status: 401 } } },
    "@/lib/ai-generation-gate": { GENERATION_LIMIT_REACHED_CODE: "GENERATION_LIMIT_REACHED" },
    "@/lib/cep-generations": {
      isMeteredCaptionsUser: () => true, billableAccountRequiredResponse: () => ({ status: 403 }),
      generationsStatusForResolvedUser: async () => ({ total_generations_left: left }),
      consumeGenerationForResolvedUser: async (_user, tool, cost) => { charges.push({ tool, cost }); return { ok: consumeOk, status: { total_generations_left: Math.max(0, left - 1) } }; },
    },
    "@/lib/caption-highlights": analysis,
  });
  return { call: segments => mod.POST({ json: async () => ({ segments }) }), metrics: () => ({ models, charges }) };
}
test("successful AI highlighting consumes exactly one generation on the server", async () => {
  const r = route(); const response = await r.call([["meaningful"]]);
  assert.equal(response.status, 200); assert.equal(response.body.cost, 1);
  assert.deepEqual(r.metrics(), { models: 1, charges: [{ tool: "captions", cost: 1 }] });
});
test("unauthorized, insufficient-credit and invalid requests never invoke AI or charge", async () => {
  for (const [options, input, status] of [[{ authenticated: false }, [["word"]], 401], [{ left: 0 }, [["word"]], 402], [{}, [], 400]]) {
    const r = route(options); assert.equal((await r.call(input)).status, status);
    assert.deepEqual(r.metrics(), { models: 0, charges: [] });
  }
});
test("invalid model response does not charge; concurrent credit exhaustion withholds result", async () => {
  const failed = route({ valid: false }); assert.equal((await failed.call([["word"]])).status, 502);
  assert.equal(failed.metrics().charges.length, 0);
  const race = route({ consumeOk: false }); const response = await race.call([["word"]]);
  assert.equal(response.status, 402); assert.equal(response.body.ranges, undefined);
});
