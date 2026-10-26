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
    File, Buffer, console: { info() {}, error() {} },
    process: { env: { REPLICATE_API_TOKEN: "test-only" } } });
  return exports;
}
const analysis = load("../lib/caption-highlights.ts");
const plain = value => JSON.parse(JSON.stringify(value));

test("semantic analysis uses indices, supports repeated words and one contiguous phrase per segment", async () => {
  const segments = [["this", "word", "stays", "highlighted"], ["same", "same"]];
  const result = await analysis.analyzeCaptionHighlights(segments, async system => {
    assert.match(system, /untrusted/);
    return '[[2,"stays"],[3,"highlighted"],[5,"same"]]';
  });
  assert.deepEqual(plain(result), [{ segment: 0, index: 2, length: 2 }, { segment: 1, index: 1, length: 1 }]);
});
test("missing, duplicate, fractional and hallucinated model indices are rejected", () => {
  for (const result of ['[]', '{}', '[{"segment":0,"index":0,"length":3}]', '[{"segment":0,"index":0.5,"length":1}]',
    '[{"segment":0,"index":0,"length":1},{"segment":0,"index":0,"length":1}]']) {
    assert.throws(() => analysis.parseHighlightRanges(result, [["one", "two"]]));
  }
});

// Exact provider output from the failed 2026-10-26 caption request.
const explainedHighlight = '```json\n[{"segment":0,"index":7,"length":2}]\n```\n\nThe phrase "close-up" is the key concept being defined and emphasized in this rule about visual emphasis.';
const screenshotWords = "The most important rule is simple: a close-up should emphasize a meaningful idea.".split(" ");

test("the actual provider response can be parsed without treating the explanation as JSON", () => {
  const result = analysis.parseHighlightRanges(explainedHighlight, [screenshotWords]);
  assert.deepEqual(plain(result), [{ segment: 0, index: 7, length: 2 }]);
});

test("both highlight contracts accept one complete JSON array surrounded by model prose", () => {
  for (const wrap of [json => json, json => `Result:\n${json}\nSelected for emphasis.`,
    json => `Here is the result:\n\`\`\`JSON\n${json}\n\`\`\`\nExplanation with [word IDs] follows.`]) {
    assert.deepEqual(plain(analysis.parseHighlightRanges(wrap('[{"segment":0,"index":7,"length":2}]'), [screenshotWords])),
      [{ segment: 0, index: 7, length: 2 }]);
    assert.deepEqual([...analysis.parseHighlightWordRanges(wrap('[[7,2],[11,2]]'), 13)], [7, 8, 11, 12]);
    assert.deepEqual([...analysis.parseHighlightWordRanges(wrap('[]'), 13)], []);
  }
});

test("extraction rejects truncated, ambiguous and invalid ranges instead of salvaging partial output", () => {
  for (const text of ['[[7,2]', '[[7,2]] [[11,2]]', '```json\n[[7,2]]\n```\n```json\n[[11,2]]\n```',
    '{"ranges":[[7,2]]}', '```json\n[[7,2]]', '[[7,2],]', '[[7,99]]\nExplanation.', '[[7,2],[8,1]]']) {
    assert.throws(() => analysis.parseHighlightWordRanges(text, 13));
  }
  assert.throws(() => analysis.parseHighlightRanges('```json\n[{"segment":0,"index":7,"length":99}]\n```\nExplanation.', [screenshotWords]));
});
test("the entire legacy transcript uses one model call, including 1200 visual segments", async () => {
  let calls = 0;
  const result = await analysis.analyzeCaptionHighlights(Array.from({ length: 1200 }, () => ["and"]), async (_system, prompt) => {
    calls++; assert.equal(JSON.parse(prompt).words.length, 1200); return '[]';
  });
  assert.equal(calls, 1); assert.equal(result.length, 1200); assert.equal(result[1199].segment, 1199);
});
test("oversized or invalid input is rejected before model work", () => {
  for (const input of [null, [], [[""]], [[4]], Array.from({ length: 1201 }, () => ["a"]),
    Array.from({ length: 41 }, () => ["a".repeat(1000)])]) assert.throws(() => analysis.validateHighlightSegments(input));
});

function route({ left = 3, authenticated = true, valid = true, consumeOk = true, timed = false, modelOutput } = {}) {
  let models = 0, charges = [];
  const mod = load("../app/(main)/api/generations/caption-highlights/route.ts", {
    "@/lib/user-activity": { withGenerationActivity: async (_user, _tool, operation) => operation() },
    "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    replicate: { default: class { async run(_model, { input }) {
      models++; if (!valid) return 'bad';
      const word = JSON.parse(input.prompt).words[0];
      return modelOutput ?? JSON.stringify([[word[0], word[3]]]);
    } } },
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
  return { call: input => mod.POST({ json: async () => timed ? { words: input } : { segments: input } }), metrics: () => ({ models, charges }) };
}
test("successful AI highlighting consumes exactly one generation on the server", async () => {
  const r = route(); const response = await r.call([["meaningful"]]);
  assert.equal(response.status, 200); assert.equal(response.body.cost, 1);
  assert.deepEqual(r.metrics(), { models: 1, charges: [{ tool: "captions", cost: 1 }] });
});

const timedWords = Array.from({ length: 1501 }, (_, i) => ({ text: i < 2 ? "same" : "word", start: i * .1, end: i * .1 + .08 }));

test("full timestamped transcript reaches Haiku once and repeated words retain exact timings", async () => {
  let calls = 0;
  const result = await analysis.highlightCaptionWords(timedWords, async (system, prompt) => {
    calls++;
    assert.match(system, /untrusted/);
    assert.match(system, /each sentence in the full context/);
    const { words, sentences } = JSON.parse(prompt);
    assert.deepEqual(sentences, [[0, 1501]]);
    assert.equal(words.length, 1501);
    assert.deepEqual(words[1], [1, timedWords[1].start, timedWords[1].end, "same"]);
    return '[[1,"same"],[1499,"word"],[1500,"word"]]';
  });
  assert.equal(calls, 1);
  assert.deepEqual(plain(result.map(({ highlight, ...word }) => word)), timedWords);
  assert.deepEqual(plain(result.flatMap((w, i) => w.highlight ? [i] : [])), [1, 1499, 1500]);
  assert.equal(timedWords.some(w => "highlight" in w), false);
});

test("sentence context follows complete transcript punctuation and retains a final unpunctuated sentence", async () => {
  const texts = ["The", "most", "important", "rule", "is", "simple:", "emphasize", "a", "detail.", "Same", "same!", "Tail"];
  const input = texts.map((text, i) => ({ text, start: i, end: i + .8 }));
  const result = await analysis.highlightCaptionWords(input, async (system, prompt) => {
    const body = JSON.parse(prompt);
    assert.deepEqual(body.sentences, [[0, 9], [9, 2], [11, 1]]);
    assert.deepEqual(body.words.map(word => word[3]), texts);
    assert.match(system, /independent of visual caption layout/);
    assert.match(system, /Infer sentence boundaries from meaning/);
    return '[[1,"most"],[2,"important"],[8,"detail."],[10,"same!"]]';
  });
  assert.deepEqual(plain(result.flatMap((word, id) => word.highlight ? [id] : [])), [1, 2, 8, 10]);
  assert.deepEqual(plain(result.map(({ highlight, ...word }) => word)), input);
});

test("invalid timestamped input never calls AI; malformed ranges never retry", async () => {
  for (const words of [[], [{ text: "word", start: -1, end: 1 }], [{ text: "word", start: 1, end: 0 }],
    [{ text: "word", start: "0", end: 1 }], Array.from({ length: 41 }, () => ({ text: "a".repeat(1000), start: 0, end: 1 }))]) {
    let calls = 0;
    await assert.rejects(analysis.highlightCaptionWords(words, async () => { calls++; return '[]'; }));
    assert.equal(calls, 0);
  }
  for (const output of ['bad', '{}', '[[0,0]]', '[[0.5,1]]', '[[0,1502]]', '[[1,2],[2,1]]', '[[1,1],[0,1]]']) {
    let calls = 0;
    await assert.rejects(analysis.highlightCaptionWords(timedWords, async () => { calls++; return output; }));
    assert.equal(calls, 1);
  }
  const clear = await analysis.highlightCaptionWords(timedWords, async () => '[]');
  assert.equal(clear.some(w => w.highlight), false);
});

test("standalone operation returns timestamped words and charges once", async () => {
  const r = route({ timed: true });
  const response = await r.call(timedWords);
  assert.equal(response.status, 200);
  assert.equal(response.body.words.length, timedWords.length);
  assert.deepEqual(plain(response.body.words[0]), { ...timedWords[0], highlight: true });
  assert.deepEqual(r.metrics(), { models: 1, charges: [{ tool: "captions", cost: 1 }] });
});

const preciseHighlight = '```json\n[[7,"close-up"],[11,"meaningful"],[12,"idea."]]\n```\nThese are the key concepts.';

test("exact word selection keeps close-up separate from should and spans visual cards", async () => {
  const input = screenshotWords.map((text, i) => ({ text, start: i, end: i + .8 }));
  const r = route({ timed: true, modelOutput: [preciseHighlight.slice(0, 30), preciseHighlight.slice(30)] });
  const response = await r.call(input);
  assert.equal(response.status, 200);
  assert.deepEqual(plain(response.body.words.flatMap((w, id) => w.highlight ? [id] : [])), [7, 11, 12]);
  assert.equal(response.body.words[8].highlight, false);
  assert.deepEqual(plain(response.body.words.map(({ highlight, ...word }) => word)), input);
  assert.deepEqual(r.metrics(), { models: 1, charges: [{ tool: "captions", cost: 1 }] });
});

test("semantic selection requires matching source tokens and unambiguous repeated words", () => {
  const input = screenshotWords.map(text => ({ text, start: 0, end: 0 }));
  assert.deepEqual([...analysis.parseHighlightSelections(preciseHighlight, input)], [7, 11, 12]);
  for (const output of ['[[7,1]]', '[{"segment":0,"index":7,"length":1}]',
    '[[7,"close-up",8]]', '[[7,"idea."]]', '[[99,"close-up"]]', '[[7,"close-up"],[7,"close-up"]]',
    '[[11,"meaningful"],[7,"close-up"]]']) {
    assert.throws(() => analysis.parseHighlightSelections(output, input));
  }
  const repeated = [{ text: "same", start: 0, end: 1 }, { text: "same", start: 1, end: 2 }];
  assert.deepEqual([...analysis.parseHighlightSelections('[[1,"same"]]', repeated)], [1]);
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
