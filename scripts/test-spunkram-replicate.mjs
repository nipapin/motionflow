import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function load(file, imports = {}, env = {}, globals = {}) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, require: name => name === "server-only" ? {} : imports[name] ?? {},
    process: { env }, Buffer, File, URL,
    console: { info() {}, error() {} }, ...globals,
  });
  return exports;
}

const tokens = { REPLICATE_API_TOKEN: "shared-test", REPLICATE_SPUNKRAM_API_TOKEN: "spunkram-test" };
const spunkram = { id: 7, source: "cep-bearer", cepClient: "spunkram-cep" };

test("Spunkram has no fallback; other panels and web use the shared account", () => {
  const env = { ...tokens };
  const { getReplicateApiToken } = load("lib/replicate-auth.ts", {}, env);
  assert.equal(getReplicateApiToken(spunkram), "spunkram-test");
  for (const user of [{ source: "session" }, { source: "odin-bearer" },
    { cepClient: "gal-cep" }, { cepClient: "motionflow-adobe" }, {}]) {
    assert.equal(getReplicateApiToken(user), "shared-test");
  }
  delete env.REPLICATE_SPUNKRAM_API_TOKEN;
  assert.equal(getReplicateApiToken(spunkram), undefined);
  env.REPLICATE_SPUNKRAM_API_TOKEN = "  ";
  assert.equal(getReplicateApiToken(spunkram), undefined);
  env.REPLICATE_SPUNKRAM_API_TOKEN = " spunkram-only ";
  delete env.REPLICATE_API_TOKEN;
  assert.equal(getReplicateApiToken(spunkram), "spunkram-only");
  assert.equal(getReplicateApiToken({ source: "session" }), undefined);
});

test("generic API authentication retains only the verified CEP client", async () => {
  const session = { id: 7, email: "test@example.invalid" };
  let bearer = { id: 7, client: "spunkram-cep" };
  const { resolveRequestUser } = load("lib/auth/resolve-request-user.ts", {
    "@/lib/cep-auth": { resolveCepBearerUser: async () => bearer },
    "@/lib/auth/get-session-user": { loadUserById: async () => session, getSessionUser: async () => session },
  });
  const req = { headers: { get: () => "test" } };
  const user = await resolveRequestUser(req);
  assert.equal(user.cepClient, "spunkram-cep");
  assert.equal(session.cepClient, undefined, "do not mutate a shared session object");
  bearer = null;
  assert.equal((await resolveRequestUser(req)).cepClient, undefined);
});

const routes = ["captions", "chapters", "sections", "voiceover", "caption-highlights",
  "image", "image-edit", "image-upscale", "image-remove-background", "svg", "video", "tts", "stt"];

function route(tool, user, env, extras = {}, globals = {}) {
  const clients = [];
  const api = load(`app/(main)/api/generations/${tool}/route.ts`, {
    "@/lib/replicate-auth": load("lib/replicate-auth.ts", {}, env),
    "next/server": { NextResponse: { json: (body, opts) => ({ body, status: opts?.status ?? 200 }) } },
    replicate: { default: class {
      constructor(options) { clients.push(options.auth); }
      async run() { throw Error("Unexpected model call"); }
    } },
    "@/lib/auth/resolve-request-user": { resolveRequestUser: async () => user },
    "@/lib/auth/resolve-captions-user": {
      requireCaptionsAuth: async () => ({ ok: true, user }), bearerFromRequest: () => null,
      identityFromFormData: () => ({}), identityFromJsonBody: () => ({}),
    },
    "@/lib/creator-ai-generation-access": { requireCreatorAiForGeneration: async () => ({ ok: true }) },
    "@/lib/user-activity": { withGenerationActivity: async (_user, _tool, run) => run() },
    "@/lib/cep-generations": { isBillableCepUser: () => true, isMeteredCaptionsUser: () => true },
    ...extras,
  }, env, globals);
  return {
    clients,
    post: (body, form = new Map()) => api.POST({
      json: async () => body ?? {}, formData: async () => form,
      headers: { get: () => null }, signal: new AbortController().signal,
    }),
  };
}

for (const tool of routes) {
  test(`${tool}: missing Spunkram token returns 503 before using the shared account`, async () => {
    const r = route(tool, spunkram, { REPLICATE_API_TOKEN: tokens.REPLICATE_API_TOKEN });
    assert.equal((await r.post()).status, 503);
    assert.deepEqual(r.clients, []);
  });

  test(`${tool}: caller selects a separate client per request`, async () => {
    for (const [user, expected, env] of [
      [spunkram, "spunkram-test", { REPLICATE_SPUNKRAM_API_TOKEN: "spunkram-test" }],
      [{ id: 7, source: "session" }, "shared-test", tokens],
      [{ id: 7, source: "cep-bearer", cepClient: "motionflow-adobe" }, "shared-test", tokens],
    ]) {
      const r = route(tool, user, env);
      await r.post({ cepClient: "spunkram-cep" });
      assert.deepEqual(r.clients, [expected]);
    }
  });
}

test("mirroring output uses the generating account's token", async () => {
  const headers = [];
  const { mirrorReplicateUrlsToR2 } = load("lib/replicate-mirror-output.ts", {
    "@/lib/r2-storage": { uploadRemoteUrlToR2: async (_url, opts) => {
      headers.push(opts.headers.Authorization); return { url: "https://cdn.example.invalid/output" };
    } },
  }, tokens);
  await mirrorReplicateUrlsToR2(["https://replicate.delivery/spunkram"], { keyPrefix: "test", apiToken: "spunkram-test" });
  await mirrorReplicateUrlsToR2(["https://replicate.delivery/shared"], { keyPrefix: "test" });
  assert.deepEqual(headers, ["Bearer spunkram-test", "Bearer shared-test"]);
});

test("Spunkram captions keep the separate token through transcription, translation and JumpCut", async () => {
  for (const translate of [false, true]) {
    const calls = [];
    const r = route("captions", spunkram, { REPLICATE_SPUNKRAM_API_TOKEN: "spunkram-test" }, {
      replicate: { default: class {
        constructor({ auth }) { this.auth = auth; }
        async run(model) {
          calls.push([model.split(":")[0], this.auth]);
          return model.startsWith("elevenlabs/")
            ? { text: "Hello world.", words: [
              { text: "Hello", start: 0, end: 1, type: "word" },
              { text: "world.", start: 1, end: 2, type: "word" },
            ] }
            : translate ? '["Привет мир."]' : '[]';
        }
      } },
      "@/lib/cep-generations": {
        isMeteredCaptionsUser: () => true,
        generationsStatusForResolvedUser: async () => ({ total_generations_left: 10 }),
        consumeGenerationForResolvedUser: async () => ({ ok: true, status: {} }),
      },
      "@/lib/r2-storage": { uploadBufferToR2: async () => ({ url: "https://cdn.example.invalid/input.mp3" }) },
      "@/lib/generation-cost": load("lib/generation-cost.ts"),
      "@/lib/generation-languages": { LANGUAGE_NAMES: { ru: "Russian" }, languageNameFor: () => "Russian" },
      "@/lib/captions-chapters-receipt": { issueCaptionsChaptersReceipt: () => "receipt" },
      "@/lib/jumpcut-analysis": { analyzeZoomPhrases: async (_words, _frequency, generate) => {
        await generate("zoom", "transcript"); return [];
      } },
    });
    const form = new Map([["file", new File(["audio"], "test.mp3", { type: "audio/mpeg" })],
      ["durationSeconds", "2"]]);
    if (translate) form.set("translateTo", "ru");
    else form.set("jumpCutFrequency", "medium");
    assert.equal((await r.post({}, form)).status, 200);
    assert.equal(calls[0][0], "elevenlabs/scribe-v2");
    assert.equal(calls.length, 2);
    assert.ok(calls.every(([, auth]) => auth === "spunkram-test"));
  }
});

test("voiceover downloads the result with the same Spunkram credential", async () => {
  const authHeaders = [];
  const r = route("voiceover", spunkram, { REPLICATE_SPUNKRAM_API_TOKEN: "spunkram-test" }, {
    replicate: { default: class {
      constructor({ auth }) { assert.equal(auth, "spunkram-test"); }
      async run() { return "https://replicate.delivery/audio.mp3"; }
    } },
    "@/lib/cep-generations": {
      isBillableCepUser: () => true,
      generationsStatusForResolvedUser: async () => ({ total_generations_left: 10 }),
      consumeGenerationForResolvedUser: async () => ({ ok: true, status: {} }),
    },
    "@/lib/cep-voiceover": { resolveVoiceId: () => "Wise_Woman" },
    "@/lib/minimax-language-boost": { resolveLanguageBoost: () => "Automatic" },
    "@/lib/generation-cost": load("lib/generation-cost.ts"),
    "@/lib/generation-records": { insertGenerationRecord: async () => {} },
    "@/lib/r2-storage": { uploadBufferToR2: async () => ({ url: "https://cdn.example.invalid/output.mp3" }) },
  }, { fetch: async (_url, options) => {
    authHeaders.push(options.headers.Authorization);
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(16000) };
  } });
  assert.equal((await r.post({ text: "Hello world" })).status, 200);
  assert.deepEqual(authHeaders, ["Bearer spunkram-test"]);
});
