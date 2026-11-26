import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
// No network, real database, provider calls, or environment credentials in these tests.
function loader(mocks = {}) {
  const allowed = new Set([
    "@/lib/ai-tool-cost", "@/lib/ai-generation-gate", "@/lib/generations", "@/lib/generation-limits", "@/lib/creator-ai-generation-access",
    "@/app/(main)/api/generations/video/route",
  ]);
  const cache = new Map();
  const context = vm.createContext({
    URL, process: { env: { REPLICATE_API_TOKEN: "test-only", NODE_ENV: "test" } },
    console: { error() {}, warn() {} },
  });
  function load(id) {
    if (id === "server-only") return {};
    if (Object.hasOwn(mocks, id)) return mocks[id];
    assert.ok(allowed.has(id), `Unmocked dependency: ${id}`);
    if (cache.has(id)) return cache.get(id).exports;
    const filename = path.join(root, `${id.slice(2)}.ts`);
    const source = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const module = { exports: {} };
    cache.set(id, module);
    vm.runInContext(`(function(require,module,exports){${source}\n})`, context, { filename })(load, module, module.exports);
    return module.exports;
  }
  return load;
}

const { AI_VIDEO_GENERATION_COST } = loader()("@/lib/ai-tool-cost");

test("client gate accepts a one-unit tool with two credits but blocks video", () => {
  const { getAiGenerateBlockReason: gate } = loader()("@/lib/ai-generation-gate");
  const user = { id: 7 };
  assert.equal(gate(user, { plan: "creator_ai", total_generations_left: 2 }, false), null);
  assert.equal(gate(user, { plan: "creator_ai", total_generations_left: 2 }, false, AI_VIDEO_GENERATION_COST), "limit");
  assert.equal(gate(user, { plan: "creator_ai", total_generations_left: 3 }, false, AI_VIDEO_GENERATION_COST), null);
  assert.equal(gate(null, null, false, AI_VIDEO_GENERATION_COST), "sign_in");
  assert.equal(gate(user, { plan: "creator", total_generations_left: 10 }, false, AI_VIDEO_GENERATION_COST), null);
});

function balanceFixture({ subscription = 0, extras = 0, failExtra = false } = {}) {
  let used = 100 - subscription;
  let extra = extras;
  let snapshot;
  const events = [];
  const conn = {
    beginTransaction: async () => { snapshot = { used, extra }; events.push("begin"); },
    commit: async () => events.push("commit"),
    rollback: async () => { ({ used, extra } = snapshot); events.push("rollback"); },
    release: () => events.push("release"),
    execute: async (sql, params) => {
      if (sql.includes("SELECT COUNT(*)")) return [[{ c: used }]];
      assert.match(sql, /INSERT INTO `user_generations`/);
      assert.equal(params[0], 7);
      events.push(`subscription:${params[2]}`);
      used += 1;
      return [{ affectedRows: 1 }];
    },
  };
  const load = loader({
    "@/lib/db": { getPool: () => ({ query: async () => [], execute: async () => [[{ c: 1 }]], getConnection: async () => conn }) },
    "@/lib/subscriptions": { getMotionflowGenerationContext: async () => ({ plan: "creator_ai" }) },
    "@/lib/user-generation-credits": {
      MOTIONFLOW_CREDITS_AUTHOR_ID: 0,
      ensureCreditsRowForUser: async () => {},
      ensureUserGenerationCreditsSchema: async () => {},
      fetchCreditsRowLocked: async () => ({ extra_balance: extra }),
      subscriptionAdjustmentFromRow: () => 0,
      decrementExtraBalanceOne: async () => {
        events.push("extra");
        if (failExtra || extra < 1) return false;
        extra -= 1;
        return true;
      },
    },
  });
  return { ...load("@/lib/generations"), events, balance: () => ({ subscription: 100 - used, extras: extra }) };
}

test("video consumes three monthly units", async () => {
  const f = balanceFixture({ subscription: 5, extras: 4 });
  const result = await f.consumeGeneration(7, "video", AI_VIDEO_GENERATION_COST);
  assert.equal(result.ok, true);
  assert.deepEqual(f.balance(), { subscription: 2, extras: 4 });
  assert.equal(result.status.total_generations_left, 6);
  assert.equal(f.events.filter(e => e === "subscription:video").length, 3);
});

test("video combines two monthly units with one extra unit", async () => {
  const f = balanceFixture({ subscription: 2, extras: 1 });
  const result = await f.consumeGeneration(7, "video", AI_VIDEO_GENERATION_COST);
  assert.equal(result.ok, true);
  assert.deepEqual(f.balance(), { subscription: 0, extras: 0 });
  assert.equal(result.status.total_generations_left, 0);
});

test("video consumes three extras after monthly quota is exhausted", async () => {
  const f = balanceFixture({ extras: 5 });
  const result = await f.consumeGeneration(7, "video", AI_VIDEO_GENERATION_COST);
  assert.equal(result.ok, true);
  assert.deepEqual(f.balance(), { subscription: 0, extras: 2 });
  assert.equal(result.status.extra_generations_left, 2);
});

test("insufficient video balance is preserved and returned accurately", async () => {
  const f = balanceFixture({ subscription: 1, extras: 1 });
  const result = await f.consumeGeneration(7, "video", AI_VIDEO_GENERATION_COST);
  assert.equal(result.ok, false);
  assert.deepEqual(f.balance(), { subscription: 1, extras: 1 });
  assert.equal(result.status.total_generations_left, 2);
  assert.equal(result.status.subscription_generations_left, 1);
  assert.equal(result.status.extra_generations_left, 1);
  assert.deepEqual(f.events, ["begin", "rollback", "release"]);
});

test("failed extra debit rolls back earlier monthly debits", async () => {
  const f = balanceFixture({ subscription: 2, extras: 1, failExtra: true });
  const result = await f.consumeGeneration(7, "video", AI_VIDEO_GENERATION_COST);
  assert.equal(result.ok, false);
  assert.deepEqual(f.balance(), { subscription: 2, extras: 1 });
  assert.equal(result.status.total_generations_left, 3);
  assert.ok(f.events.includes("rollback"));
});

test("other tools still consume one unit by default", async () => {
  const f = balanceFixture({ subscription: 2 });
  const result = await f.consumeGeneration(7, "image");
  assert.equal(result.ok, true);
  assert.deepEqual(f.balance(), { subscription: 1, extras: 0 });
});

function videoFixture({ left = 3, premium = true, output = "https://example.test/video.mp4", fail = false, debitRejected = false, cepClient } = {}) {
  const events = [];
  const status = { plan: "creator_ai", total_generations_left: left, subscription_generations_left: left, extra_generations_left: 0 };
  const load = loader({
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } },
    replicate: class { async run(model) { events.push({ type: "provider", model }); if (fail) throw new Error("Test provider failure"); return output; } },
    "@/lib/auth/resolve-request-user": { resolveRequestUser: async () => ({ id: 7, cepClient }), requestHasCepBearer: () => Boolean(cepClient) },
    "@/lib/replicate-auth": { getReplicateApiToken: () => "fixture-only" },
    "@/lib/replicate-usage-fetch": { trackedReplicateFetch: () => async () => { throw new Error("Unexpected network call"); } },
    "@/lib/creator-ai-generation-access": { requireCreatorAiForGeneration: async () => ({ ok: true }) },
    "@/lib/generations": {
      getGenerationsStatus: async () => status,
      getBillingPeriodUsageWindow: async () => ({ start: "2026-10-01", endExclusive: "2026-11-01" }),
      consumeGeneration: async (user, tool, cost) => {
        events.push({ type: "debit", user, tool, cost });
        return { ok: !debitRejected, status: { ...status, total_generations_left: debitRejected ? 2 : left - cost } };
      },
    },
    "@/lib/generation-records": {
      countCompletedOkExtraFundedGrokVideos: async () => 0,
      countCompletedOkSubscriptionGrokVideosInWindow: async () => premium ? 0 : 20,
      insertGenerationRecord: async record => { events.push({ type: "record", status: record.status }); return 9; },
    },
    "@/lib/paddle-server": { getLifetimeExtraGenerationsPurchased: async () => 0 },
    "@/lib/replicate-mirror-output": { mirrorReplicateUrlsToR2: async urls => urls },
  });
  const { POST } = load("@/app/(main)/api/generations/video/route");
  return { events, run: () => POST({ json: async () => ({ prompt: "Test video", cost: 1 }) }) };
}

test("API rejects balances 0–2 before contacting the video provider", async () => {
  for (const left of [0, 1, 2]) {
    const f = videoFixture({ left });
    const result = await f.run();
    assert.equal(result.status, 402);
    assert.equal(result.body.cost, 3);
    assert.equal(result.body.total_generations_left, left);
    assert.equal(f.events.length, 0);
  }
});

test("both video models debit exactly three units regardless of client-supplied cost", async () => {
  for (const premium of [true, false]) {
    const f = videoFixture({ left: 4, premium });
    const result = await f.run();
    assert.equal(result.status, 200);
    assert.equal(result.body.cost, 3);
    assert.equal(result.body.generations.total_generations_left, 1);
    assert.equal(f.events.find(e => e.type === "provider").model, premium ? "xai/grok-imagine-video" : "prunaai/p-video");
    assert.deepEqual(f.events.find(e => e.type === "debit"), { type: "debit", user: 7, tool: "video", cost: 3 });
  }
});

test("video from a CEP client keeps the one-credit cost", async () => {
  const fixture = videoFixture({ left: 1, cepClient: "premiere" });
  const result = await fixture.run();
  assert.equal(result.status, 200);
  assert.equal(result.body.cost, 1);
  assert.equal(result.body.generations.total_generations_left, 0);
  assert.equal(fixture.events.find(event => event.type === "debit").cost, 1);
});

test("failed or empty provider output never consumes credits", async () => {
  for (const options of [{ fail: true }, { output: null }]) {
    const f = videoFixture(options);
    const result = await f.run();
    assert.ok(result.status >= 400);
    assert.equal(f.events.filter(e => e.type === "debit").length, 0);
  }
});

test("final atomic debit rejection returns remaining balance and no successful record", async () => {
  const f = videoFixture({ debitRejected: true });
  const result = await f.run();
  assert.equal(result.status, 402);
  assert.equal(result.body.cost, 3);
  assert.equal(result.body.total_generations_left, 2);
  assert.equal(f.events.filter(e => e.type === "record" && e.status === "ok").length, 0);
});


for (const [plan, cap] of [["none", 5], ["creator", 10], ["creator_ai", 100]]) {
  test(`${plan} uses the real ${cap}-generation allowance and preserves used credits`, async () => {
    const load = loader({
      "@/lib/db": { getPool: () => ({ query: async () => [], execute: async () => [[{ c: 3 }]] }) },
      "@/lib/subscriptions": { getMotionflowGenerationContext: async () => ({ plan }) },
      "@/lib/user-generation-credits": {
        MOTIONFLOW_CREDITS_AUTHOR_ID: 0, ensureUserGenerationCreditsSchema: async () => {},
        getExtraBalance: async () => 2, getSubscriptionAdjustment: async () => 0,
      },
    });
    const status = await load("@/lib/generations").getGenerationsStatus(7);
    assert.equal(status.limit, cap);
    assert.equal(status.subscription_generations_left, cap - 3);
    assert.equal(status.total_generations_left, cap - 3 + 2);
    assert.equal(status.used, 3);
  });
  test(`${plan} can generate within its quota and cannot generate with zero balance`, async () => {
    for (const remaining of [0, cap]) {
      const load = loader({
        "@/lib/generations": { getGenerationsStatus: async () => ({ plan, total_generations_left: remaining }) },
        "@/lib/subscriptions": { getMotionflowGenerationPlan: async () => plan },
        "next/server": { NextResponse: { json: (body, options) => ({ body, status: options.status }) } },
      });
      const { requireCreatorAiForGeneration } = load("@/lib/creator-ai-generation-access");
      const result = await requireCreatorAiForGeneration(7);
      assert.equal(result.ok, remaining > 0);
      if (!result.ok) {
        assert.equal(result.response.status, 402);
        assert.equal(result.response.body.code, "GENERATION_LIMIT_REACHED");
      }
      const cepResult = await requireCreatorAiForGeneration(7, "premiere");
      assert.equal(cepResult.ok, plan === "creator_ai");
      if (!cepResult.ok) {
        assert.equal(cepResult.response.status, 403);
        assert.equal(cepResult.response.body.code, "CREATOR_AI_REQUIRED");
      }
      const gate = loader()("@/lib/ai-generation-gate").getAiGenerateBlockReason;
      assert.equal(gate({ id: 7 }, { plan, total_generations_left: remaining }, false), remaining > 0 ? null : "limit");
      assert.equal(gate({ id: 7 }, { plan, total_generations_left: 2 }, false, 3), "limit");
    }
  });
}
