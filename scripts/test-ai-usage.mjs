import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url);

function loader(mocks = {}, env = {}, globals = {}) {
  const cache = new Map();
  function load(name) {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === "server-only") return {};
    if (!name.startsWith("@/")) return require(name);
    if (cache.has(name)) return cache.get(name);
    const code = ts.transpileModule(readFileSync(new URL(`../${name.slice(2)}.ts`, import.meta.url), "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const exports = {}; cache.set(name, exports);
    vm.runInNewContext(code, { exports, require: load, process: { env }, URL, URLSearchParams, Request, Response,
      AbortSignal, Buffer, console: { error() {} }, ...globals });
    return exports;
  }
  return load;
}
const env = { REPLICATE_API_TOKEN: "shared", REPLICATE_SPUNKRAM_API_TOKEN: "spunkram",
  REPLICATE_TOOLKIT_API_TOKEN: "toolkit", REPLICATE_ODINPRO_API_TOKEN: "odin" };
const filters = { from: "2026-10-26T22:00:00.000Z", to: "2026-10-27T22:00:00.000Z", account: "", model: "", status: "", page: 1 };
const prediction = { id: "p123", model: "owner/model", created_at: "2026-10-27T12:00:00Z", completed_at: "2026-10-27T12:00:05Z",
  status: "succeeded", metrics: { predict_time: 3, total_time: 5, token_input_count: 12, token_output_count: 2 },
  input: { prompt: "private text" }, output: "private result" };

test("verified panels select their dedicated key and never fall back", () => {
  const config = { ...env }, load = loader({}, config), { getReplicateApiToken } = load("@/lib/replicate-auth");
  for (const [client, key, expected] of [["spunkram-cep", "REPLICATE_SPUNKRAM_API_TOKEN", "spunkram"],
    ["gal-cep", "REPLICATE_TOOLKIT_API_TOKEN", "toolkit"], ["odin-cep", "REPLICATE_ODINPRO_API_TOKEN", "odin"]]) {
    assert.equal(getReplicateApiToken({ cepClient: client }), expected);
    delete config[key]; assert.equal(getReplicateApiToken({ cepClient: client }), undefined);
  }
  assert.equal(getReplicateApiToken({ source: "odin-bearer" }), undefined);
  assert.equal(getReplicateApiToken({ source: "session" }), "shared");
  assert.equal(getReplicateApiToken({ cepClient: "motionflow-adobe" }), "shared");
});

test("date filters preserve timezones, reject invalid ranges, pages and authors", () => {
  const { parseAiUsageFilters } = loader()("@/lib/ai-usage-store");
  const params = new URLSearchParams({ from: "2026-10-27T00:00:00+02:00", to: "2026-10-28T00:00:00+02:00" });
  assert.equal(parseAiUsageFilters(params).from, filters.from);
  for (const bad of [{ from: "bad" }, { from: params.get("to") }, { account: "evil" }, { status: "oops" },
    { page: "-1" }, { page: "1.5" }, { to: "2030-01-01T00:00:00Z" }]) {
    const next = new URLSearchParams(params); for (const [key, value] of Object.entries(bad)) next.set(key, value);
    assert.equal(parseAiUsageFilters(next), null);
  }
});

test("prediction persistence excludes prompts and secrets and retains provider metrics", async () => {
  const calls = [];
  const store = loader({ "@/lib/db": { getPool: () => ({ query: async () => [], execute: async (sql, args) => { calls.push({ sql, args }); return [{}]; } }) } })("@/lib/ai-usage-store");
  assert.equal(await store.saveAiPrediction(prediction, { id: "odin:uuid", source: "odin-bearer", cepClient: "odin-cep" }), true);
  const { sql, args } = calls[0];
  assert.equal(args[1], "odinpro"); assert.equal(args[10], "odin:uuid");
  assert.deepEqual(Array.from(args.slice(6, 10)), [3, 5, 12, 2]);
  assert.ok(!JSON.stringify(args).includes("private"));
  assert.match(sql, /account_key = IF\(VALUES\(account_key\) = 'unknown', account_key/);
  assert.match(sql, /COALESCE\(VALUES\(predict_seconds\), predict_seconds\)/);
  assert.equal(await store.saveAiPrediction({ ...prediction, id: "invalid/id" }), false);
  assert.equal(calls.length, 1);
});

test("tracking preserves the response and attributes every prediction, even on shared accounts", async () => {
  const recorded = [], response = Response.json(prediction);
  const { trackedReplicateFetch } = loader({ "@/lib/ai-usage-store": { saveAiPrediction: async (p, user) => recorded.push([p, user]) } }, {},
    { fetch: async () => response })("@/lib/replicate-usage-fetch");
  const user = { id: 7, cepClient: "gal-cep" }, tracked = trackedReplicateFetch(user);
  user.cepClient = "spunkram-cep";
  assert.equal(await tracked("https://api.replicate.com/v1/models/owner/model/predictions"), response);
  assert.equal(recorded[0][1].cepClient, "gal-cep", "capture identity without sharing mutable request state");
  assert.equal((await response.json()).id, prediction.id, "do not consume SDK response");
  await tracked("https://replicate.delivery/result.png"); assert.equal(recorded.length, 1);
});

test("a usage-storage failure never interrupts an otherwise successful generation", async () => {
  const response = Response.json(prediction);
  const { trackedReplicateFetch } = loader({ "@/lib/ai-usage-store": { saveAiPrediction: async () => { throw Error("DB unavailable"); } } }, {},
    { fetch: async () => response })("@/lib/replicate-usage-fetch");
  assert.equal(await trackedReplicateFetch({})("https://api.replicate.com/v1/predictions/p123"), response);
});

function syncFixture({ failAt = 0, leased = false } = {}) {
  const state = { next_cursor: null, complete: 0 }, requests = [], saved = [];
  let requestCount = 0;
  const pool = { execute: async (sql, args) => {
    if (sql.startsWith("SELECT next_cursor")) return [[{ ...state }]];
    if (sql.includes("SET next_cursor = ?")) { state.next_cursor = args[0]; state.complete = args[1]; }
    if (sql.includes("SET next_cursor = NULL")) { state.next_cursor = null; state.complete = 0; }
    return [{ affectedRows: leased ? 0 : 1 }];
  } };
  const load = loader({ "@/lib/db": { getPool: () => pool },
    "@/lib/ai-usage-store": { ensureAiUsageSchema: async () => {}, rangeKey: () => "range", saveAiPrediction: async p => { saved.push(p.id); return true; } },
  }, env, { fetch: async (url, opts) => {
    requests.push({ url: String(url), auth: opts.headers.Authorization }); requestCount++;
    if (requestCount === failAt) return new Response("rate limited", { status: 429 });
    const cursor = new URL(url).searchParams.get("cursor"); const page = cursor ? Number(cursor) : 0;
    return Response.json({ results: [{ id: `p${page}` }], next: page < 3 ? `https://api.replicate.com/v1/predictions?cursor=${page + 1}&injected=ignored` : null });
  } });
  return { ...load("@/lib/ai-usage-sync"), state, requests, saved };
}

test("sync uses the default key, imports every page once and durably resumes", async () => {
  const f = syncFixture();
  assert.equal((await f.syncAiUsage(filters, true)).complete, false);
  assert.equal(f.state.next_cursor, "3");
  assert.equal((await f.syncAiUsage(filters, false)).complete, true);
  assert.deepEqual(f.saved, ["p0", "p1", "p2", "p3"]);
  for (const request of f.requests) {
    assert.equal(request.auth, "Bearer shared");
    const url = new URL(request.url);
    assert.equal(url.searchParams.get("created_after"), filters.from);
    assert.equal(url.searchParams.get("created_before"), filters.to);
    assert.equal(url.searchParams.get("injected"), null);
  }
});

test("rate limits retain the last saved page; simultaneous sync is rejected", async () => {
  const f = syncFixture({ failAt: 2 });
  await assert.rejects(f.syncAiUsage(filters, true), error => error.status === 429);
  assert.equal(f.state.next_cursor, "1");
  await f.syncAiUsage(filters, false);
  assert.deepEqual(f.saved, ["p0", "p1", "p2", "p3"]);
  const locked = syncFixture({ leased: true });
  await assert.rejects(locked.syncAiUsage(filters, false), error => error.status === 409);
  assert.equal(locked.requests.length, 0);
});

test("provider pagination cannot redirect the API key to another host", () => {
  const { replicateNextCursor } = syncFixture();
  for (const url of ["https://evil.test/v1/predictions?cursor=1", "http://api.replicate.com/v1/predictions?cursor=1",
    "https://api.replicate.com/v1/models?cursor=1", "https://user:secret@api.replicate.com/v1/predictions?cursor=1"]) {
    assert.throws(() => replicateNextCursor(url));
  }
  assert.equal(replicateNextCursor(null), null);
});

test("admin API denies unauthorized reads and cross-origin sync before provider or DB calls", async () => {
  let admin = false, reads = 0, syncs = 0;
  const api = loader({ "next/server": { NextResponse: { json: (body, init) => ({ body, status: init.status }) } },
    "@/lib/auth/get-session-user": { getSessionUser: async () => ({ id: 1 }) },
    "@/lib/affiliate/admin": { isAffiliateAdmin: () => admin },
    "@/lib/ai-usage-store": { parseAiUsageFilters: () => filters, readAiUsage: async () => { reads++; return {}; } },
    "@/lib/ai-usage-sync": { syncAiUsage: async () => { syncs++; return {}; }, AiUsageSyncError: class extends Error {} },
  })("@/app/(main)/api/admin/ai-usage/route");
  const request = origin => ({ nextUrl: new URL("https://motionflow.pro/api/admin/ai-usage"), headers: { get: name => name === "origin" ? origin : null }, json: async () => ({ restart: false }) });
  assert.equal((await api.GET(request())).status, 403);
  assert.equal((await api.POST(request("https://motionflow.pro"))).status, 403);
  assert.equal(reads + syncs, 0);
  admin = true;
  assert.equal((await api.POST(request("https://evil.test"))).status, 403);
  assert.equal(syncs, 0);
  assert.equal((await api.GET(request())).status, 200);
  assert.equal((await api.POST(request("https://motionflow.pro"))).status, 200);
  assert.equal(reads, 1); assert.equal(syncs, 1);
  const proxied = request("https://motionflow.pro");
  proxied.nextUrl = new URL("http://127.0.0.1:3000/api/admin/ai-usage");
  proxied.headers.get = name => ({ origin: "https://motionflow.pro", "x-forwarded-host": "motionflow.pro", "x-forwarded-proto": "https" })[name] ?? null;
  assert.equal((await api.POST(proxied)).status, 200);
  assert.equal(syncs, 2);
});

test("summary, rows and author totals share exact UTC bounds and parameterized filters", async () => {
  const calls = [];
  const load = loader({ "@/lib/db": { getPool: () => ({ query: async () => [], execute: async (sql, values) => {
    calls.push({ sql, values });
    if (sql.includes("GROUP BY account_key")) return [[{ account_key: "toolkit", total: "2", predictSeconds: "1.5" }]];
    if (sql.includes("SELECT prediction_id AS id")) return [[{ ...prediction, account: "toolkit", predictSeconds: "1.5", totalSeconds: "2", inputTokens: null, outputTokens: "0" }]];
    if (sql.includes("SELECT DISTINCT model")) return [[{ model: "owner/model" }]];
    if (sql.includes("FROM ai_usage_sync_ranges")) return [[{ complete: 0, updatedAt: null, running: 0 }]];
    return [[{ total: "2", succeeded: "2", predictSeconds: "1.5", measured: "1" }]];
  } }) } }, env);
  const model = "model' OR 1=1 --";
  const result = await load("@/lib/ai-usage-store").readAiUsage({ ...filters, model, account: "toolkit", status: "succeeded", page: 2 });
  assert.equal(result.totals.total, 2);
  assert.equal(result.accounts.find(item => item.id === "toolkit").total, 2);
  assert.equal(result.rows[0].predictSeconds, 1.5);
  assert.equal(result.rows[0].inputTokens, null); assert.equal(result.rows[0].outputTokens, 0);
  for (const query of calls.filter(call => call.sql.includes("WHERE created_at"))) {
    assert.equal(query.values[0], "2026-10-26 22:00:00.000");
    assert.equal(query.values[1], "2026-10-27 22:00:00.000");
    assert.match(query.sql, /created_at >= \? AND created_at < \?/);
    assert.ok(!query.sql.includes(model));
  }
  assert.match(calls.find(call => call.sql.includes("SELECT prediction_id")).sql, /LIMIT 50 OFFSET 50/);
});

test("billable metrics retain only safe unit counts and preserve previously recorded units", async () => {
  const calls = [];
  const load = loader({ "@/lib/db": { getPool: () => ({ query: async () => [], execute: async (sql, args) => { calls.push({sql, args}); return [{}]; } }) } });
  const { saveAiBillingMetrics } = load("@/lib/ai-usage-billing");
  await saveAiBillingMetrics("p123", {image_output_count: 2, generic_output_count: 3, prompt: "private", output: "private", api_token: "secret"});
  assert.deepEqual(JSON.parse(calls[0].args[1]), {image_output_count: 2, generic_output_count: 3});
  assert.match(calls[0].sql, /JSON_MERGE_PATCH/);
  await saveAiBillingMetrics("p123", {image_output_count: -1, generic_output_count: 1.5});
  assert.equal(calls.length, 1);
});
