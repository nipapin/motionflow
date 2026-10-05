import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function loader(mocks = {}, globals = {}) {
  const cache = new Map();
  function load(name) {
    if (name === "server-only") return {};
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith("@/")) return require(name);
    if (cache.has(name)) return cache.get(name).exports;
    const url = new URL(`../${name.slice(2)}.ts`, import.meta.url);
    const code = ts.transpileModule(readFileSync(url, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const mod = { exports: {} };
    cache.set(name, mod);
    vm.runInThisContext(`(function(require,module,exports,${Object.keys(globals).join(",")}){${code}\n})`, { filename: url.pathname })(load, mod, mod.exports, ...Object.values(globals));
    return mod.exports;
  }
  return load;
}
const token = "Bearer odincep_" + "a".repeat(64);
const user = { id: "odin:account-1", email: "one@test.invalid", name: "One", source: "odin-bearer", cepClient: "odin-cep", treatAsSubscribed: false,
  odinSubscriptionActive: true, odinSubscriptionExpiresAt: "2099-01-01T00:00:00Z" };

// Isolated SQL boundary: require the real conditional UPDATE and serialize
// transactions as the database does, without loading .env or touching live data.
function ledger() {
  const usage = new Map();
  let queue = Promise.resolve();
  let month = "2026-10";
  let calls = 0;
  let failUpdate = false;
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [`${month}-15T12:00:00Z`])); }
    static now() { return new Clock().getTime(); }
  }
  const execute = async (sql, args) => {
    calls++;
    if (sql.startsWith("INSERT IGNORE")) { const key = args.join("|"); if (!usage.has(key)) usage.set(key, 0); return [{ affectedRows: 1 }]; }
    if (sql.startsWith("UPDATE")) {
      assert.match(sql, /AND used \+ \? <= \?/);
      if (failUpdate) throw Error("DB failure");
      const [amount, id, month, checkedAmount, limit] = args;
      assert.equal(amount, checkedAmount);
      const key = `${id}|${month}`;
      const current = usage.get(key);
      if (current + amount > limit) return [{ affectedRows: 0 }];
      usage.set(key, current + amount);
      return [{ affectedRows: 1 }];
    }
    assert.match(sql, /^SELECT used/);
    const value = usage.get(args.join("|"));
    return [value === undefined ? [] : [{ used: value }]];
  };
  const pool = { query: async () => { calls++; }, execute,
    getConnection: async () => {
      const previous = queue;
      let release;
      queue = new Promise(resolve => { release = resolve; });
      await previous;
      const snapshot = new Map(usage);
      return { execute, beginTransaction: async () => {}, commit: async () => {},
        rollback: async () => { usage.clear(); for (const [key, value] of snapshot) usage.set(key, value); }, release };
    } };
  const load = loader({ "@/lib/db": { getPool: () => pool } }, { Date: Clock });
  return { api: load("@/lib/odin-ai"), load, usage, get calls() { return calls; },
    month: value => { month = value; }, failUpdate: value => { failUpdate = value; } };
}

test("Odin identity comes only from its token-verified account service", async () => {
  const requests = [];
  let profile = { user: { id: "uuid-account", email: "member@test.invalid", name: "Member" }, subscription: { active: true, renews_at: "2099-01-01" } };
  let status = 200;
  const load = loader({ "@/lib/db": {} }, { fetch: async (url, opts) => {
    requests.push({ url, opts });
    return new Response(JSON.stringify(profile), { status });
  } });
  const api = load("@/lib/odin-ai");
  const resolved = await api.resolveOdinAiUser(token);
  assert.equal(resolved.id, "odin:uuid-account");
  assert.equal(resolved.odinSubscriptionActive, true);
  assert.equal(requests[0].url, "https://odin-pro.com/api/cep/me?client=odin-cep");
  assert.equal(requests[0].opts.headers.Authorization, token);
  assert.equal(requests[0].opts.redirect, "error");
  assert.equal(await api.resolveOdinAiUser("Bearer mfcep_" + "a".repeat(64)), null);
  assert.equal(requests.length, 1);
  status = 401;
  assert.equal(await api.resolveOdinAiUser(token), null);
  status = 503;
  await assert.rejects(api.resolveOdinAiUser(token), /unavailable/);
  status = 200;
  profile = { user: { id: "../../spoof", email: "member@test.invalid" }, subscription: { active: true } };
  assert.equal(await api.resolveOdinAiUser(token), null);
});

test("unsubscribed and expired Odin accounts get zero and cannot use receipts to bypass subscription", async () => {
  const f = ledger();
  for (const denied of [{ ...user, odinSubscriptionActive: false }, { ...user, odinSubscriptionExpiresAt: "2000-01-01" }]) {
    assert.equal((await f.api.odinAiStatus(denied)).total_generations_left, 0);
    assert.equal((await f.api.consumeOdinAi(denied, 1)).ok, false);
    assert.equal((await f.api.consumeOdinAi(denied, 0)).ok, false);
  }
  assert.equal(f.calls, 0);
});

test("100 monthly generations are shared across tools/devices and reset only in a new UTC month", async () => {
  const f = ledger();
  assert.equal((await f.api.odinAiStatus(user)).remaining, 100);
  const first = await f.api.consumeOdinAi(user, 98);
  assert.equal(first.status.remaining, 2);
  const results = await Promise.all(Array.from({ length: 8 }, () => f.api.consumeOdinAi({ ...user }, 1)));
  assert.equal(results.filter(result => result.ok).length, 2);
  assert.equal((await f.api.odinAiStatus(user)).remaining, 0);
  assert.equal((await f.api.consumeOdinAi(user, 1)).ok, false);
  assert.equal((await f.api.consumeOdinAi(user, 0)).ok, true);
  assert.equal((await f.api.odinAiStatus({ ...user, id: "odin:another-account" })).remaining, 100);
  assert.equal((await f.api.odinAiStatus({ ...user, odinSubscriptionActive: false })).remaining, 0);
  assert.equal((await f.api.odinAiStatus(user)).remaining, 0);
  f.month("2026-11");
  assert.equal((await f.api.odinAiStatus(user)).remaining, 100);
});

test("invalid costs and database failures cannot grant or consume credits", async () => {
  const f = ledger();
  for (const amount of [-1, NaN, Infinity, 0.5]) await assert.rejects(f.api.consumeOdinAi(user, amount), /Invalid/);
  assert.equal(f.calls, 0);
  f.failUpdate(true);
  await assert.rejects(f.api.consumeOdinAi(user, 1), /DB failure/);
  f.failUpdate(false);
  assert.equal((await f.api.odinAiStatus(user)).remaining, 100);
});

test("Odin tokens never fall back to a Motionflow session or trust body identity", async () => {
  let sessionCalls = 0;
  const load = loader({
    "@/lib/auth/get-session-user": { getSessionUser: async () => { sessionCalls++; return { id: 1 }; } },
    "@/lib/subscriptions": {}, "@/lib/cep-auth": {}, "@/lib/cep-client-registry": {}, "@/lib/cep-entitlements": {},
    "@/lib/odin-ai": { resolveOdinAiUser: async () => null },
  });
  assert.equal(await load("@/lib/auth/resolve-captions-user").resolveCaptionsUser({ bearer: token, email: "spoof@test.invalid", userId: "1" }), null);
  assert.equal(sessionCalls, 0);
});

test("balance and tool dispatch meter Odin separately from Motionflow accounts", async () => {
  const f = ledger();
  const load = loader({
    "@/lib/odin-ai": f.api,
    "@/lib/cep-client-registry": {}, "@/lib/cep-entitlements": {},
    "@/lib/generations": { getGenerationsStatus: async () => ({ marker: "motionflow" }) },
  });
  const metering = load("@/lib/cep-generations");
  assert.equal((await metering.generationsStatusForResolvedUser(user)).limit, 100);
  assert.equal((await metering.consumeGenerationForResolvedUser(user, "captions", 2)).status.remaining, 98);
  assert.equal((await metering.consumeGenerationForResolvedUser(user, "chapters", 1)).status.remaining, 97);
  assert.equal((await metering.consumeGenerationForResolvedUser(user, "video", 1)).ok, false);
  assert.equal((await metering.generationsStatusForResolvedUser({ id: 1, source: "session" })).marker, "motionflow");
  assert.equal((await metering.generationsStatusForResolvedUser({ id: "unverified", source: "session" })).remaining, 0);
});

test("combined captions/chapters receipts are bound to the external account namespace", () => {
  const previous = process.env.CAPTIONS_CHAPTERS_RECEIPT_SECRET;
  process.env.CAPTIONS_CHAPTERS_RECEIPT_SECRET = "isolated-test-secret";
  try {
    const receipts = loader()("@/lib/captions-chapters-receipt");
    const receipt = receipts.issueCaptionsChaptersReceipt({ userId: "odin:1", durationSeconds: 120, cost: 1 });
    assert.equal(receipts.verifyCaptionsChaptersReceipt(receipt, "odin:1").ok, true);
    assert.equal(receipts.verifyCaptionsChaptersReceipt(receipt, 1).ok, false);
    assert.equal(receipts.verifyCaptionsChaptersReceipt(receipt, "odin:2").ok, false);
    const numeric = receipts.issueCaptionsChaptersReceipt({ userId: 1, durationSeconds: 120, cost: 1 });
    assert.equal(receipts.verifyCaptionsChaptersReceipt(numeric, 1).ok, true);
  } finally {
    if (previous === undefined) delete process.env.CAPTIONS_CHAPTERS_RECEIPT_SECRET;
    else process.env.CAPTIONS_CHAPTERS_RECEIPT_SECRET = previous;
  }
});
