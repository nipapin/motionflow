import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function load(file, imports = {}) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, Buffer, Response, process: { env: {} }, console: { error() {}, warn() {} },
    require(name) {
      if (name === "server-only") return {};
      if (!Object.hasOwn(imports, name)) throw new Error(`Unexpected import ${name}`);
      return imports[name];
    },
  });
  return exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
const shared = load("../lib/user-activity-shared.ts");
const input = { userId: 7, action: "marketplace_download", resourceType: "marketplace_item", resourceId: 42, source: "web" };

function writer({ unavailable = false } = {}) {
  const calls = [];
  const pool = {
    async query(sql) { if (unavailable) throw new Error("Database unavailable"); calls.push({ sql }); return [[]]; },
    async execute(sql, params) { calls.push({ sql, params: plain(params) }); return [{ insertId: 9 }]; },
  };
  return { calls, ...load("../lib/user-activity.ts", { "@/lib/db": { getPool: () => pool } }) };
}

test("download handoff is recorded separately from requested and never claims completion", async () => {
  const service = writer();
  const response = await service.withDownloadActivity(input, async activity => {
    await activity.linkLegacyDownload(123);
    activity.issued("redirect");
    return new Response(null, { status: 303, headers: { Location: "https://files.example.test/signed?token=SECRET" } });
  });
  assert.equal(response.status, 303);
  const insert = service.calls.find(call => call.sql.startsWith("INSERT"));
  assert.equal(insert.params[8], "requested");
  const update = service.calls.at(-1);
  assert.equal(update.params[0], "issued");
  assert.deepEqual(JSON.parse(update.params[1]), { delivery: "redirect", httpStatus: 303 });
  assert.ok(service.calls.some(call => call.sql.includes("legacy_download_id") && call.params?.[0] === 123));
  assert.ok(!JSON.stringify(service.calls).includes("SECRET"));
});

test("failed downloads and pricing redirects are never reported as issued", async () => {
  for (const status of [302, 403, 404, 429, 502]) {
    const service = writer();
    await service.withDownloadActivity(input, async () => new Response(null, { status }));
    assert.equal(service.calls.at(-1).params[0], "failed");
    assert.equal(JSON.parse(service.calls.at(-1).params[1]).httpStatus, status);
  }
  const service = writer();
  await assert.rejects(service.withDownloadActivity(input, async () => { throw new Error("SECRET_UPSTREAM_ERROR"); }));
  assert.equal(service.calls.at(-1).params[0], "failed");
  assert.ok(!JSON.stringify(service.calls).includes("SECRET_UPSTREAM_ERROR"));
});

test("analytics outages do not stop downloads and external identities cannot become Motionflow users", async () => {
  const service = writer({ unavailable: true });
  const response = await service.withDownloadActivity(input, async activity => { activity.issued("stream"); return new Response("file"); });
  assert.equal(await response.text(), "file");
  const valid = writer();
  for (const userId of [0, -1, "odin:7", NaN]) assert.equal(await valid.recordUserActivity({ ...input, userId, category: "download", status: "requested" }), null);
  assert.equal(valid.calls.length, 0);
});

test("structured AI records one outcome per call, even without credit use, and isolates Odin", async () => {
  const service = writer();
  await service.withGenerationActivity({ id: 7, source: "cep-bearer", cepClient: "gal-cep" }, "chapters", async () => new Response("{}"));
  assert.equal(service.calls.filter(call => call.sql.startsWith("INSERT")).length, 1);
  assert.equal(service.calls.at(-1).params[8], "ok");
  await service.withGenerationActivity({ id: "odin:7", source: "odin-bearer" }, "chapters", async () => new Response("{}"));
  assert.equal(service.calls.filter(call => call.sql.startsWith("INSERT")).length, 1);
  await service.withGenerationActivity({ id: 7, source: "session" }, "captions", async () => new Response(null, { status: 502 }));
  assert.equal(service.calls.at(-1).params[8], "failed");
});

test("pack reports produce changes, version changes and removals without duplicating heartbeats", () => {
  const { diffPackActivity } = load("../lib/pack-activity.ts", { "@/lib/user-activity": {} });
  const pack = (id, version = "1") => ({ id, name: `Pack ${id}`, version });
  assert.deepEqual(plain(diffPackActivity([pack(1)], [pack(1), pack(1)], "installs")), []);
  const changes = plain(diffPackActivity([pack(1), pack(2)], [pack(1, "2"), pack(3)], "installs"));
  assert.deepEqual(changes.map(change => change.action), ["pack_updated", "pack_installed", "pack_removed"]);
  assert.deepEqual(changes[0].details, { version: "2", previousVersion: "1" });
  assert.deepEqual(plain(diffPackActivity([pack(1)], [pack(2)], "active")).map(change => change.action), ["pack_activated", "pack_deactivated"]);
  assert.equal(diffPackActivity([], [pack(1), pack(1)], "installs").length, 1);
});

function reader(execute = async () => [[]]) {
  return load("../lib/user-activity-reader.ts", {
    "@/lib/db": { getPool: () => ({ execute }) },
    "@/lib/market-items": { getMarketItemsByIds: async () => [] },
    "@/lib/user-activity": { ensureUserActivitySchema: async () => {} },
  });
}
test("cursor rejects malformed payloads, impossible dates, oversized IDs and invalid origins", () => {
  const { decodeActivityCursor } = reader();
  const valid = { time: "2026-10-26 12:30:04.123000", origin: "event", id: "123" };
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  assert.deepEqual(plain(decodeActivityCursor(encode(valid))), valid);
  for (const value of [null, {}, { ...valid, origin: "sql" }, { ...valid, id: "0" }, { ...valid, id: "18446744073709551616" },
    { ...valid, time: "2026-02-31 12:30:04.123000" }, { ...valid, time: "2026-10-26 29:30:04.123000" }]) assert.equal(decodeActivityCursor(encode(value)), null);
  for (const value of ["", "!", "x".repeat(257)]) assert.equal(decodeActivityCursor(value), null);
});

test("activity reads are user scoped, category filtered, bounded, redacted and keyset paginated", async () => {
  const calls = [];
  const service = reader(async (sql, params) => {
    calls.push({ sql, params });
    const origin = sql.includes("FROM generation_records") ? "generation" : "event";
    if (!sql.includes("FROM user_activity") && origin !== "generation") return [[]];
    return [Array.from({ length: 51 }, (_, index) => ({
      rowId: String(200 - index), category: "generation", action: "generation", resourceType: "tool", resourceId: "video",
      resourceName: null, source: "unknown", deviceId: null, status: "ok", details: null, sortTime: "2026-10-26 12:00:00.000000",
    }))];
  });
  const page = await service.listUserActivity(7, { category: "generation" });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.params[0] === 7 && call.sql.includes("LIMIT 51")));
  assert.ok(calls.every(call => !call.sql.includes("result AS") && !call.sql.includes("error_message")));
  assert.equal(page.entries.length, 50);
  assert.equal(new Set(page.entries.map(entry => entry.id)).size, 50);
  assert.ok(page.entries.every(entry => !Object.hasOwn(entry, "cursor")));
  const cursor = service.decodeActivityCursor(page.nextCursor);
  calls.length = 0;
  await service.listUserActivity(7, { cursor });
  assert.equal(calls.length, 4);
  assert.ok(calls.every(call => call.params.includes(cursor.time)));
  assert.ok(calls.find(call => call.sql.includes("FROM subscription_downloads")).sql.includes("NOT EXISTS"));
});

test("only absent legacy tables become a visible partial-history notice; outages fail the read", async () => {
  const service = reader(async sql => {
    if (sql.includes("FROM generation_records")) throw Object.assign(new Error("missing"), { code: "ER_NO_SUCH_TABLE" });
    return [[]];
  });
  assert.deepEqual(plain((await service.listUserActivity(7)).unavailableSources), ["generation"]);
  await assert.rejects(reader(async () => { throw Object.assign(new Error("offline"), { code: "ECONNREFUSED" }); }).listUserActivity(7));
});

test("admin activity endpoint enforces permissions before reading data and disables caching", async () => {
  let session = null, reads = 0;
  const service = reader();
  const route = load("../app/(main)/api/admin/users/[id]/activity/route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200, headers: options.headers }) } },
    "@/lib/auth/get-session-user": { getSessionUser: async () => session },
    "@/lib/affiliate/admin": { isAffiliateAdmin: user => user?.admin === true },
    "@/lib/user-activity-shared": shared,
    "@/lib/user-activity-reader": { decodeActivityCursor: service.decodeActivityCursor, listUserActivity: async () => { reads++; return { entries: [], nextCursor: null, unavailableSources: [] }; } },
  });
  const req = query => ({ nextUrl: new URL(`http://localhost/activity${query}`) });
  const params = { params: Promise.resolve({ id: "7" }) };
  assert.equal((await route.GET(req(""), params)).status, 403);
  session = { admin: false };
  assert.equal((await route.GET(req(""), params)).status, 403);
  assert.equal(reads, 0);
  session = { admin: true };
  for (const query of ["?cursor=", "?cursor=abc", "?category=other"]) assert.equal((await route.GET(req(query), params)).status, 400);
  assert.equal((await route.GET(req(""), { params: Promise.resolve({ id: "-1" }) })).status, 400);
  assert.equal(reads, 0);
  const response = await route.GET(req("?category=download"), params);
  assert.equal(response.status, 200);
  assert.equal(response.headers["Cache-Control"], "private, no-store");
  assert.equal(reads, 1);
});

test("actual catalog route records one-time purchases as well as subscriptions, without duplicate legacy history", async () => {
  for (const subscribed of [false, true]) {
    const service = writer();
    const legacyInserts = [];
    const route = load("../app/(main)/api/download/[itemId]/route.ts", {
      "node:crypto": { default: { randomBytes: () => ({ toString: () => "PRIVATE_PURCHASE_CODE" }) } },
      "next/server": { NextResponse: Response },
      "@/lib/auth/resolve-request-user": { requestHasCepBearer: () => false, resolveRequestUser: async () => ({ id: 7 }) },
      "@/lib/db": { getPool: () => ({ execute: async (sql, params) => { legacyInserts.push({ sql, params }); return [{ insertId: 123 }]; } }) },
      "@/lib/market-items": { getMarketItemsByIds: async () => [{ id: 42, name: "Paid pack", author_id: 6, price: 20 }] },
      "@/lib/purchases": { userOwnsItem: async () => !subscribed, getPurchaseCodeForOwnedItem: async () => "PRIVATE_PURCHASE_CODE" },
      "@/lib/motionflow-urls": {}, "@/lib/motionflow-upstream-download": {},
      "@/lib/marketplace-r2-presign": { getPresignedMarketplaceDownloadUrl: async () => "https://fixture.test/pack.zip?token=SECRET" },
      "@/lib/marketplace-download-rate-limit": { checkMarketplaceDownloadRateLimit: async () => ({ ok: true }) },
      "@/lib/product-ui": { productKind: () => "template" },
      "@/lib/subscriptions": { hasActiveMotionflowSubscription: async () => subscribed },
      "@/lib/cep-entitlements": { getActiveAuthorSubscription: async () => ({ active: false }) },
      "@/lib/user-activity": service,
    });
    const response = await route.GET({}, { params: Promise.resolve({ itemId: "42" }) });
    assert.equal(response.status, 303);
    assert.equal(service.calls.filter(call => call.sql.startsWith("INSERT INTO user_activity")).length, 1);
    assert.equal(service.calls.at(-1).params[0], "issued");
    assert.equal(legacyInserts.length, subscribed ? 1 : 0);
    assert.equal(service.calls.filter(call => call.sql.startsWith("UPDATE user_activity SET legacy_download_id")).length, subscribed ? 1 : 0);
    assert.ok(!JSON.stringify(service.calls).includes("PRIVATE_PURCHASE_CODE"));
    assert.ok(!JSON.stringify(service.calls).includes("SECRET"));
  }
});
