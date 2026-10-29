import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");
const root = path.resolve(new URL("../", import.meta.url).pathname);
function loader(mocks) {
  const cache = new Map();
  function load(id) {
    if (id === "server-only") return {};
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (!id.startsWith("@/")) return require(id);
    if (cache.has(id)) return cache.get(id).exports;
    const filename = path.join(root, `${id.slice(2)}.ts`);
    const source = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const module = { exports: {} }; cache.set(id, module);
    vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename })(load, module, module.exports);
    return module.exports;
  }
  return load;
}
const routeId = "@/app/(main)/api/extensions/[authorId]/users/[userId]/generation-credits/route";
const requestId = "11111111-1111-4111-8111-111111111111";
const ctx = (author = "1691", user = "7") => ({ params: Promise.resolve({ authorId: author, userId: user }) });
const getRequest = () => new NextRequest("http://localhost/api");
const postRequest = body => new NextRequest("http://localhost/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
function fixture({ admin = { id: 6, email: "admin@example.test" }, failAudit = false, userExists = true } = {}) {
  const balances = new Map([["7:1691", 20], ["7:4141", 50], ["7:0", 90]]);
  const audits = []; const events = []; let snapshot;
  const conn = {
    beginTransaction: async () => { snapshot = { balances: new Map(balances), audits: [...audits] }; events.push("begin"); },
    commit: async () => events.push("commit"),
    rollback: async () => { balances.clear(); for (const entry of snapshot.balances) balances.set(...entry); audits.splice(0, audits.length, ...snapshot.audits); events.push("rollback"); },
    execute: async (sql, values) => {
      if (sql.startsWith("SELECT id FROM users")) return [userExists ? [{ id: 7 }] : []];
      if (sql.includes("SELECT payload")) return [audits.filter(row => row.user === values[0] && row.author === values[1] && row.payload.requestId === values[2]).map(row => ({ payload: JSON.stringify(row.payload) }))];
      if (sql.includes("INSERT INTO user_generation_credit_audit")) {
        if (failAudit) throw new Error("fixture audit failure");
        audits.push({ user: values[0], author: values[1], payload: JSON.parse(values[2]), note: values[3] });
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected test SQL: ${sql}`);
    },
  };
  const cfg = { client: "spunkram-cep", authorId: 1691, platformSubscription: false, extensionName: "Spunkram" };
  const pool = { query: async () => [], execute: async sql => sql.startsWith("SELECT id FROM users") ? [userExists ? [{ id: 7 }] : []] : [[{ c: 0 }]] };
  const user = { id: 7, source: "cep-bearer", client: "spunkram-cep" };
  const load = loader({
    "@/lib/auth/get-session-user": { getSessionUser: async () => admin },
    "@/lib/packages-admin": { isPackagesAdmin: email => email === "admin@example.test", getPackagesAuthorById: async id => id > 0 ? { id } : null },
    "@/lib/cep-client-registry": { ODIN_CEP_CLIENT: "odin-cep", getCepClientByAuthorId: id => id === 1691 ? cfg : null, getCepClientConfig: () => cfg, requireCepClientConfig: () => cfg },
    "@/lib/db": { getPool: () => pool },
    "@/lib/account-audit": { withAccountAudit: async (actor, work) => { events.push(actor); return work(conn); } },
    "@/lib/user-generation-credits": {
      ensureUserGenerationCreditsSchema: async () => {},
      ensureCreditsRowForUser: async (u, a) => { if (!balances.has(`${u}:${a}`)) balances.set(`${u}:${a}`, 0); },
      fetchCreditsRowLocked: async (u, a) => { events.push({ lock: [u, a] }); return { extra_balance: balances.get(`${u}:${a}`) }; },
      incrementPurchasedExtraBalance: async (u, n, connection, a) => { assert.equal(connection, conn); balances.set(`${u}:${a}`, balances.get(`${u}:${a}`) + n); },
      getExtraBalance: async (u, a) => balances.get(`${u}:${a}`) ?? 0,
      getSubscriptionAdjustment: async () => 0,
    },
    "@/lib/subscriptions": { getMotionflowGenerationContext: async () => ({ plan: "none" }) },
    "@/lib/auth/resolve-captions-user": { bearerFromRequest: () => "fixture-only", resolveCaptionsUser: async () => user },
    "@/lib/cep-auth": { resolveCepBearerUser: async () => user },
    "@/lib/cep-entitlements": { getActiveAuthorSubscription: async () => ({ active: false }), cepAiGenerationsLimit: () => 5 },
    "@/lib/cep-generations": {},
  });
  return { route: load(routeId), service: load("@/lib/admin-author-generation-credits"), cep: load("@/app/(main)/api/cep/generations/route"), balances, audits, events };
}

test("only packages administrators can read or change author credits", async () => {
  for (const admin of [null, { id: 8, email: "member@example.test" }]) {
    const f = fixture({ admin });
    assert.equal((await f.route.GET(getRequest(), ctx())).status, 403);
    assert.equal((await f.route.POST(postRequest({ amount: 100, requestId }), ctx())).status, 403);
    assert.equal(f.balances.get("7:1691"), 20);
    assert.equal(f.audits.length, 0);
  }
});
test("manual grant adds to Spunkram balance and the real CEP status route immediately reads it", async () => {
  const f = fixture();
  const response = await f.route.POST(postRequest({ amount: 100, requestId, note: "Support adjustment" }), ctx());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).extraBalance, 120);
  assert.equal(f.balances.get("7:0"), 90);
  assert.equal(f.balances.get("7:4141"), 50);
  assert.equal(f.audits[0].author, 1691);
  assert.equal(f.audits[0].payload.adminUserId, 6);
  assert.equal(f.audits[0].payload.before, 20);
  assert.equal(f.audits[0].payload.after, 120);
  const body = await (await f.cep.GET(getRequest())).json();
  assert.equal(body.extra_generations_left, 120);
  assert.equal(body.total_generations_left, 125);
  assert.equal((await (await f.route.GET(getRequest(), ctx())).json()).extraBalance, 120);
});
test("a repeated request is idempotent and a conflicting retry is rejected", async () => {
  const f = fixture();
  for (let i = 0; i < 2; i++) {
    const body = await (await f.route.POST(postRequest({ amount: 10, requestId }), ctx())).json();
    assert.equal(body.extraBalance, 30);
    assert.equal(body.duplicate, i > 0);
  }
  assert.equal((await f.route.POST(postRequest({ amount: 11, requestId }), ctx())).status, 409);
  assert.equal(f.balances.get("7:1691"), 30);
  assert.equal(f.audits.length, 1);
});
test("audit failure rolls back the balance rather than leaving an untracked grant", async () => {
  const f = fixture({ failAudit: true });
  await assert.rejects(f.service.addAuthorExtraGenerations({ userId: 7, authorId: 1691, adminUserId: 6, amount: 100, requestId }));
  assert.equal(f.balances.get("7:1691"), 20);
  assert.equal(f.audits.length, 0);
});
test("invalid grants, platform scopes, unsupported authors and missing users do not mutate balances", async () => {
  const f = fixture();
  for (const amount of [0, -1, 1.5, "100", 1_000_001]) assert.equal((await f.route.POST(postRequest({ amount, requestId }), ctx())).status, 400);
  assert.equal((await f.route.POST(postRequest({ amount: 1, requestId: "bad" }), ctx())).status, 400);
  for (const author of ["0", "6", "9999", "1.5"]) assert.equal((await f.route.POST(postRequest({ amount: 1, requestId }), ctx(author))).status, 404);
  assert.equal((await fixture({ userExists: false }).route.POST(postRequest({ amount: 1, requestId }), ctx())).status, 404);
  assert.equal(f.balances.get("7:1691"), 20);
  assert.equal(f.audits.length, 0);
});
test("an overflowing balance is rejected without changing credits", async () => {
  const f = fixture(); f.balances.set("7:1691", 2_147_483_647);
  assert.equal((await f.route.POST(postRequest({ amount: 1, requestId }), ctx())).status, 400);
  assert.equal(f.balances.get("7:1691"), 2_147_483_647);
});
