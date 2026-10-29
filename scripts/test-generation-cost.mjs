import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function load(file, imports = {}) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, require: name => { if (name === "@/lib/ai-usage-shared") return load("../lib/ai-usage-shared.ts"); if (name === "@/lib/replicate-usage-fetch") return { trackedReplicateFetch: () => undefined }; if (name === "@/lib/replicate-auth") return load("../lib/replicate-auth.ts", { "server-only": {} });
      if (name === "@/lib/viral-titles") return load("../lib/viral-titles.ts", {
        "server-only": {},
        "@/lib/viral-titles-prompts.json": { default: JSON.parse(readFileSync(new URL("../lib/viral-titles-prompts.json", import.meta.url), "utf8")) },
      });
      if (!Object.hasOwn(imports, name)) throw new Error(`Unexpected import: ${name}`);
      return imports[name];
    },
    File, Buffer, console,
    process: { env: { REPLICATE_API_TOKEN: "test-only" } },
  });
  return exports;
}

const metering = load("../lib/generation-cost.ts");

test("audio is billed per started five minutes, including fractional seconds", () => {
  for (const [seconds, cost] of [[1, 1], [299.99, 1], [300, 1], [300.01, 2], [600, 2], [600.01, 3], [900, 3], [3600, 12]]) {
    assert.equal(metering.durationGenerationsCost(seconds), cost, `${seconds} seconds`);
  }
  for (const seconds of [0, -1, NaN, Infinity]) assert.equal(metering.durationGenerationsCost(seconds), 1);
});

function route(tool, { seconds = 301, modelSeconds = seconds, left = 10, highlights = false, receipt = false } = {}) {
  let modelCalls = 0;
  const charges = [];
  const status = { total_generations_left: left };
  const module = load(`../app/(main)/api/generations/${tool}/route.ts`, {
    "@/lib/user-activity": { withGenerationActivity: async (_user, _tool, operation) => operation() },
    "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    replicate: { default: class { async run(model, { input } = {}) {
      modelCalls++;
      if (model.startsWith("elevenlabs/")) return {
        text: "Hello", duration_seconds: modelSeconds,
        words: [{ text: "Hello", start: 0, end: modelSeconds, type: "word" }],
      };
      if (input?.system_prompt?.includes("EDITOR TASK AND OUTPUT CONTRACT")) {
        const { candidates } = JSON.parse(input.prompt);
        return JSON.stringify({
          reviews: candidates.map(({ id }) => ({ candidate_id: id, click_score: 4, angle: `Angle ${id}`, reason: "Fixture candidate" })),
          final_titles: candidates.slice(0, 3).map(({ id, title }) => ({
            source_candidate_id: id, action: "keep", title,
            angle: `Angle ${id}`, hook: "Fixture hook", reason: "Fixture selection",
          })),
          selection_note: "Fixture editor output",
        });
      }
      const titles = input?.system_prompt?.includes("exactly 9")
        ? ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"]
        : ["One", "Two", "Three"];
      return JSON.stringify({ titles, sections: [{ start_index: 0, topic: "Intro" }], description: "Description", tags: ["audio"] });
    } } },
    "@/lib/auth/resolve-captions-user": {
      bearerFromRequest: () => "test", identityFromFormData: () => ({}), identityFromJsonBody: () => ({}),
      requireCaptionsAuth: async () => ({ ok: true, user: { id: 7 } }),
    },
    "@/lib/ai-generation-gate": { GENERATION_LIMIT_REACHED_CODE: "GENERATION_LIMIT_REACHED" },
    "@/lib/cep-generations": {
      isMeteredCaptionsUser: () => true, billableAccountRequiredResponse: () => ({ status: 403 }),
      generationsStatusForResolvedUser: async () => status,
      consumeGenerationForResolvedUser: async (_user, tool, cost) => {
        charges.push({ tool, cost }); return { ok: true, status };
      },
    },
    "@/lib/r2-storage": { uploadBufferToR2: async () => ({ url: "https://example.test/audio.mp3" }) },
    "@/lib/captions-chapters-receipt": {
      issueCaptionsChaptersReceipt: () => "receipt", verifyCaptionsChaptersReceipt: () => ({ ok: receipt }),
    },
    "@/lib/generation-languages": { LANGUAGE_NAMES: {} },
    "@/lib/generation-cost": metering,
    "@/lib/caption-highlights": { highlightCaptionWords: async words => words.map(word => ({ ...word, highlight: true })) },
    "@/lib/jumpcut-analysis": {},
  });
  const form = new Map([["file", new File(["audio"], "test.mp3", { type: "audio/mpeg" })], ["durationSeconds", String(seconds)]]);
  if (highlights) form.set("highlights", "true");
  return {
    call: (body = {}) => module.POST({
      formData: async () => form,
      json: async () => ({ chunks: [{ text: "Hello", timestamp: [0, seconds] }], durationSeconds: seconds, ...body }),
      signal: new AbortController().signal,
    }),
    charges, modelCalls: () => modelCalls,
  };
}

for (const tool of ["captions", "chapters"]) {
  test(`${tool} preflight rejects a one-credit balance for audio over five minutes`, async () => {
    const r = route(tool, { left: 1 });
    const response = await r.call();
    assert.equal(response.status, 402);
    assert.equal(response.body.cost, 2);
    assert.equal(r.modelCalls(), 0);
    assert.deepEqual(r.charges, []);
  });

  test(`${tool} returns and consumes the same five-minute cost`, async () => {
    const r = route(tool);
    const response = await r.call();
    assert.equal(response.status, 200);
    assert.equal(response.body.cost, 2);
    assert.deepEqual(r.charges, [{ tool, cost: 2 }]);
  });
}

test("captions use model duration when it exceeds the client estimate", async () => {
  const r = route("captions", { seconds: 300, modelSeconds: 601 });
  const response = await r.call();
  assert.equal(response.status, 200);
  assert.equal(response.body.cost, 3);
  assert.deepEqual(r.charges, [{ tool: "captions", cost: 3 }]);
});

test("captions highlights add one generation to the new audio cost", async () => {
  const r = route("captions", { highlights: true });
  const response = await r.call();
  assert.equal(response.status, 200);
  assert.equal(response.body.cost, 3);
  assert.deepEqual(r.charges, [{ tool: "captions", cost: 3 }]);
});

test("a valid captions receipt still avoids charging again for chapters", async () => {
  const r = route("chapters", { receipt: true, left: 0 });
  const response = await r.call({ chaptersReceipt: "receipt" });
  assert.equal(response.status, 200);
  assert.equal(response.body.cost, 0);
  assert.deepEqual(r.charges, [{ tool: "chapters", cost: 0 }]);
});
