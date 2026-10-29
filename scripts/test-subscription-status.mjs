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
    const module = { exports: {} };
    cache.set(id, module);
    vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename })(load, module, module.exports);
    return module.exports;
  }
  return load;
}
const user = { id: 17, name: "fixture", email: "fixture@example.test", deviceId: "fixture", client: "platform" };
function fixture(rows, { auth = "cookie", platform = true } = {}) {
  const authorSubscription = { active: true, plan: "author-monthly", status: "active", renews_at: "2099-09-15T10:00:00Z" };
  const load = loader({
    "@/lib/db": { getPool: () => ({ execute: async (options, params) => {
      assert.equal(options.dateStrings, true);
      assert.equal(options.timezone, "Z");
      assert.deepEqual(params, [user.id]);
      return [rows];
    } }) },
    "@/lib/paddle-product-label": { applyMotionflowProductTitleTemplate: value => `Motionflow ${value}`, normalizePaddleProductNameToken: value => value },
    "@/lib/extra-generation-packs": { isExtraGenerationsPackPriceId: id => id === "extra-pack" },
    "@/lib/auth/get-session-user": { getSessionUser: async () => auth === "cookie" ? user : null, loadUserById: async () => user },
    "@/lib/cep-auth": { listDevicesForUser: async () => [], resolveCepBearerUser: async header => auth === "bearer" && header === "Bearer fixture-only" ? user : null },
    "@/lib/cep-client-registry": { getCepClientConfig: () => ({ client: "fixture", platformSubscription: platform, freePackSlots: 1 }) },
    "@/lib/cep-entitlements": {
      cepSubscribeUrl: () => "/pricing", cepManageSubscriptionUrl: () => "/profile/subscriptions",
      resolveCepTier: async () => ({ tier: "subscribed", subscription: authorSubscription, purchases: [] }),
      cepEntitlementsForTier: () => ({ fixture: true }),
    },
    "@/lib/generations": { getGenerationsStatus: async () => ({ effective_limit: 100 }) },
  });
  const request = new NextRequest("http://localhost/api", { headers: auth === "bearer" ? { authorization: "Bearer fixture-only" } : {} });
  return {
    service: load("@/lib/subscriptions"),
    status: () => load("@/app/(main)/api/me/subscription-status/route").GET(request),
    cep: () => load("@/app/(main)/api/cep/me/route").GET(request),
    authorSubscription,
  };
}
const row = overrides => ({ id: 8, author_id: null, status: 1, subscription_id: "fixture-sub", plan: "monthly", ends_at: null, paddle_billing_period_ends_at: "2099-11-29 00:00:00", paddle_product_name: "Creator + AI", ...overrides });

for (const auth of ["cookie", "bearer"]) {
  for (const scenario of [
    { name: "active", rows: [row({})], date: "2099-11-29T00:00:00.000Z" },
    { name: "cancelled but paid", rows: [row({ status: -1, ends_at: "2099-12-01 12:00:00" })], date: "2099-12-01T12:00:00.000Z" },
    { name: "cancelled with billing end only", rows: [row({ status: -1 })], date: "2099-11-29T00:00:00.000Z" },
    { name: "active without a date", rows: [row({ paddle_billing_period_ends_at: null })], date: null },
    { name: "fallback ends_at", rows: [row({ paddle_billing_period_ends_at: null, ends_at: "2099-11-30T02:00:00+02:00" })], date: "2099-11-30T00:00:00.000Z" },
  ]) test(`${auth}: ${scenario.name} uses the same paid end as My subscriptions`, async () => {
    const f = fixture(scenario.rows, { auth });
    const response = await f.status();
    const body = await response.json();
    assert.equal(body.authenticated, true);
    assert.equal(body.active, true);
    assert.equal(body.generation_plan, "creator_ai");
    assert.equal(body.subscription.tier, "creator_ai");
    assert.equal(body.subscription.billingPeriod, "monthly");
    assert.equal(body.subscription.currentPeriodEnd, scenario.date);
    assert.equal(body.subscription.cancelled, scenario.rows[0].status === -1);
    assert.equal((await f.service.getSubscriptionsForUser(user.id))[0].endsAt, scenario.date);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    if (auth === "bearer") {
      const cep = await (await f.cep()).json();
      assert.equal(cep.subscription.renews_at, scenario.date);
      assert.equal(cep.subscription.active, true);
      assert.equal(cep.platform.generation_plan, body.generation_plan);
    }
  });
}
for (const [name, rows] of [
  ["no subscriptions", []],
  ["expired cancellation", [row({ status: -1, ends_at: "2020-01-01 00:00:00", paddle_billing_period_ends_at: null })]],
  ["cancelled without a date", [row({ status: -1, paddle_billing_period_ends_at: null })]],
  ["author-only", [row({ author_id: 1691 })]],
  ["extra credits only", [row({ paddle_price_id: "extra-pack" })]],
]) test(`${name}: null platform subscription and no invented date`, async () => {
  const f = fixture(rows, { auth: "bearer" });
  const body = await (await f.status()).json();
  assert.equal(body.authenticated, true);
  assert.equal(body.active, false);
  assert.equal(body.generation_plan, "none");
  assert.equal(body.subscription, null);
  const cep = await (await f.cep()).json();
  assert.equal(cep.subscription.active, false);
  assert.equal(cep.subscription.renews_at, null);
});
test("author clients keep their existing subscription payload", async () => {
  const f = fixture([], { auth: "bearer", platform: false });
  const body = await (await f.cep()).json();
  assert.deepEqual(body.subscription, f.authorSubscription);
});
test("anonymous subscription status and invalid CEP authentication remain compatible", async () => {
  const f = fixture([], { auth: "none" });
  assert.deepEqual(await (await f.status()).json(), { active: false, authenticated: false });
  assert.equal((await f.cep()).status, 401);
});
test("UTC date serialization respects offsets and never substitutes now", () => {
  const { subscriptionDateToIso: iso } = fixture([]).service;
  assert.equal(iso("2099-11-29 00:00:00"), "2099-11-29T00:00:00.000Z");
  assert.equal(iso("2099-11-29T03:00:00+03:00"), "2099-11-29T00:00:00.000Z");
  assert.equal(iso(new Date("2099-11-29T00:00:00Z")), "2099-11-29T00:00:00.000Z");
  for (const raw of [null, undefined, "", "invalid", "0000-00-00 00:00:00", new Date(NaN)]) assert.equal(iso(raw), null);
});

test("the selected catalog row supplies the tier and date, excluding author subscriptions", async () => {
  const f = fixture([
    row({ id: 10, author_id: 1691, paddle_billing_period_ends_at: "2099-12-20 00:00:00" }),
    row({ id: 9, subscription_id: "fixture-creator", paddle_product_name: "Creator", paddle_billing_period_ends_at: "2099-12-10 00:00:00" }),
    row({ id: 8, subscription_id: "fixture-ai", plan: "annual" }),
  ], { auth: "bearer" });
  const body = await (await f.status()).json();
  assert.equal(body.subscription.paddleSubscriptionId, "fixture-ai");
  assert.equal(body.subscription.billingPeriod, "yearly");
  assert.equal(body.subscription.tier, "creator_ai");
  const displayed = (await f.service.getSubscriptionsForUser(user.id)).find(item => item.subscriptionId === "fixture-ai");
  assert.equal(body.subscription.currentPeriodEnd, displayed.endsAt);
  assert.equal((await (await f.cep()).json()).subscription.renews_at, displayed.endsAt);
});
