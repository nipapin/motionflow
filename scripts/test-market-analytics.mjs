import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(file, imports = {}, globals = {}) {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, Buffer, URL, URLSearchParams, Blob, crypto: { randomUUID }, process: { env: {} },
    console: { error() {}, warn() {} }, require(name) {
      if (name === "server-only") return {};
      if (Object.hasOwn(imports, name)) return imports[name];
      if (!name.startsWith("@/")) return require(name);
      throw new Error(`Unexpected import ${name}`);
    }, ...globals });
  return exports;
}
const shared = load("../lib/market-analytics-shared.ts");
const schema = load("../lib/market-analytics-ingest.ts", { "@/lib/db": {}, "@/lib/market-analytics-schema": {}, "@/lib/market-analytics-shared": shared });
const validBatch = () => ({ id: randomUUID(), visit: randomUUID(), path: "/after-effects", width: 1440, layout: "test-release", heat: true, scroll: 75,
  cells: [{ kind: "dwell", x: 10, y: 20, weight: 500 }], events: [{ id: randomUUID(), action: "view", itemId: 42 }] });

test("public-page allowlist excludes profile, payments, credentials and URL parameters", () => {
  for (const path of ["/", "/after-effects", "/item/42", "/pricing", "/image-generation"]) assert.equal(shared.analyticsPublicPath(path), true);
  for (const path of ["/profile", "/profile/users", "/checkout", "/reset-password", "/api/user", "/item/42?token=secret", "//evil.test", "/contact"]) assert.equal(shared.analyticsPublicPath(path), false);
});
test("ingest schema caps packet size, counts, coordinates and weights and rejects supplied identities", () => {
  assert.equal(schema.telemetryBatchSchema.safeParse(validBatch()).success, true);
  for (const override of [{ userId: 7 }, { path: "/profile" }, { width: 0 }, { scroll: 101 }, { layout: "../secret" },
    { cells: [{ x: 40, y: 0, kind: "click", weight: 1 }] }, { cells: [{ x: 0, y: 200, kind: "dwell", weight: 1 }] },
    { cells: [{ x: 0, y: 0, kind: "move", weight: 15001 }] }, { cells: Array(193).fill(validBatch().cells[0]) },
    { events: [{ id: randomUUID(), action: "purchase", itemId: 42 }] }, { events: Array(17).fill(validBatch().events[0]) }]) {
    assert.equal(schema.telemetryBatchSchema.safeParse({ ...validBatch(), ...override }).success, false);
  }
});

const reader = load("../lib/market-analytics-reader.ts", { "@/lib/db": {}, "@/lib/market-analytics-schema": {}, "@/lib/market-analytics-shared": shared });
test("date, sort and source filters are validated before constructing database queries", () => {
  assert.ok(reader.parseMarketFilters(new URLSearchParams({ from: "2026-01-01", to: "2026-01-31" })));
  for (const params of [{ from: "2026-02-31" }, { from: "2020-01-01", to: "2026-01-31" }, { sort: "downloads;DROP TABLE users" },
    { page: "-1" }, { page: "1.5" }, { source: "other" }, { action: "refund" }, { scope: "private" }, { resourceType: "tool" }]) {
    assert.equal(reader.parseMarketFilters(new URLSearchParams(params)), null);
  }
});

function telemetry({ rate = 1, enabled = true, privateTarget = false, gpc = false } = {}) {
  const handlers = new Map(), timers = [], packets = [], domReads = { count: 0 }; let now = 1000, cleanup;
  class Element { closest() { return privateTarget; } }
  const target = new Element();
  const document = { documentElement: { get scrollHeight() { domReads.count++; return 3000; } }, visibilityState: "visible", hasFocus: () => true,
    addEventListener: (name, fn) => handlers.set(name, fn), removeEventListener: name => handlers.delete(name) };
  const window = { innerWidth: 1440, innerHeight: 900, scrollY: 0, requestIdleCallback: fn => fn(),
    setInterval: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    addEventListener: (name, fn) => handlers.set(name, fn), removeEventListener: name => handlers.delete(name) };
  window.top = window;
  const client = load("../components/market-telemetry.tsx", {
    react: { useEffect: fn => { cleanup = fn(); } }, "next/navigation": { usePathname: () => "/after-effects" },
    "@/lib/market-analytics-shared": shared, "@/lib/market-telemetry-client": { bindMarketTelemetry() {} },
  }, { window, document, Element, navigator: { globalPrivacyControl: gpc, sendBeacon: (_url, body) => { packets.push(body); return true; } },
    Math: Object.assign(Object.create(Math), { random: () => 0 }), innerWidth: 1440, innerHeight: 900, scrollY: 0,
    performance: { now: () => now }, clearTimeout() {}, clearInterval() {} });
  client.MarketTelemetry({ enabled, heatRate: rate, layout: "fixture" });
  return { handlers, timers, packets, domReads, target, tick: value => { now = value; timers.find(timer => timer.ms === 250)?.fn(); }, cleanup: () => cleanup?.() };
}
test("100,000 pointer events do no DOM work or network I/O; sampling and packet memory remain bounded", async () => {
  const client = telemetry();
  const reads = client.domReads.count;
  for (let i = 0; i < 100000; i++) client.handlers.get("pointermove")({ pointerType: "mouse", clientX: i % 1440, clientY: i % 900, target: client.target });
  assert.equal(client.domReads.count, reads);
  assert.equal(client.packets.length, 0);
  for (let i = 0; i < 20; i++) client.tick(1000 + i * 250);
  client.timers.find(timer => timer.ms === 15000).fn();
  assert.equal(client.packets.length, 1);
  const payload = JSON.parse(await client.packets[0].text());
  assert.ok(payload.cells.length <= 192);
  assert.ok(client.packets[0].size < 24000);
  assert.equal(schema.telemetryBatchSchema.safeParse(payload).success, true);
  assert.ok(client.domReads.count - reads <= 5);
  client.cleanup(); assert.equal(client.handlers.size, 0);
});
test("private fields produce no coordinates; disabled and unsampled visits install no pointer handlers", async () => {
  const client = telemetry({ privateTarget: true });
  client.handlers.get("pointermove")({ pointerType: "mouse", clientX: 400, clientY: 400, target: client.target });
  client.handlers.get("click")({ clientX: 400, clientY: 400, target: client.target });
  client.tick(1500); client.tick(1750); client.timers.find(timer => timer.ms === 15000).fn();
  assert.deepEqual(JSON.parse(await client.packets[0].text()).cells, []);
  for (const options of [{ rate: 0 }, { enabled: false }, { gpc: true }]) assert.equal(telemetry(options).handlers.has("pointermove"), false);
});

test("collector requires a matching origin, limits streamed bodies and resolves identity on the server", async () => {
  const calls = [];
  const { NextResponse } = require("next/server");
  const route = load("../app/(main)/api/analytics/collect/route.ts", {
    "next/server": { NextResponse, after() {} }, "@/lib/auth/get-session-user": { getSessionUser: async () => ({ id: 7 }) },
    "@/lib/auth/session": { extractPublicHostname: () => "motionflow.test" }, "@/lib/affiliate/admin": { isAffiliateAdmin: () => false },
    "@/lib/redis": { getRedis: () => ({ eval: async () => 1 }) },
    "@/lib/market-analytics-ingest": { ...schema, ingestTelemetry: async (batch, userId) => calls.push({ batch, userId }) },
  });
  const request = (body, origin = "https://motionflow.test") => ({ headers: new Headers({ origin }), body: new ReadableStream({ start(controller) { controller.enqueue(Buffer.from(body)); controller.close(); } }) });
  assert.equal((await route.POST(request(JSON.stringify(validBatch()), "https://evil.test"))).status, 403);
  assert.equal((await route.POST(request("x".repeat(24001)))).status, 413);
  assert.equal((await route.POST(request(JSON.stringify({ ...validBatch(), userId: 999 })))).status, 400);
  assert.equal((await route.POST(request(JSON.stringify(validBatch())))).status, 204);
  assert.equal(calls.length, 1); assert.equal(calls[0].userId, 7);
});


test("admin analytics denies non-admins before querying and returns private uncached reports", async () => {
  let admin = false, reads = 0;
  const { NextResponse } = require("next/server");
  const route = load("../app/(main)/api/admin/analytics/route.ts", {
    "next/server": { NextResponse },
    "@/lib/auth/get-session-user": { getSessionUser: async () => ({ id: 7 }) },
    "@/lib/affiliate/admin": { isAffiliateAdmin: () => admin },
    "@/lib/market-analytics-reader": { ...reader,
      readMarketOverview: async () => { reads++; return { totals: {} }; },
      readMarketHeatmap: async () => { reads++; return { cells: [] }; } },
  });
  const req = query => ({ nextUrl: new URL("https://motionflow.test/api/admin/analytics?" + query) });
  assert.equal((await route.GET(req(""))).status, 403); assert.equal(reads, 0);
  admin = true;
  assert.equal((await route.GET(req("sort=invalid"))).status, 400); assert.equal(reads, 0);
  const response = await route.GET(req(""));
  assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal((await route.GET(req("view=heatmap"))).status, 200); assert.equal(reads, 2);
});

test("item event queue is bounded and cannot leak private-page events into a later public page", () => {
  const client = load("../lib/market-telemetry-client.ts", {}, { window: {} });
  const received = [];
  for (let i = 0; i < 100; i++) client.trackMarketItem("view", i + 1);
  client.bindMarketTelemetry(event => received.push(event)); assert.equal(received.length, 16);
  client.bindMarketTelemetry(null); client.trackMarketItem("select", 999);
  client.bindMarketTelemetry(event => received.push(event)); assert.equal(received.length, 16);
  client.trackMarketItem("select", 42); assert.equal(received.at(-1).itemId, 42);
});
