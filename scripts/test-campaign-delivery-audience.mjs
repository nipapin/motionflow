import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { sendRecipient } from "../lib/campaigns/engine.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
function loader(mocks = {}) {
  const cache = new Map();
  function load(specifier, parent = root) {
    if (specifier === "server-only") return {};
    if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
    if (!specifier.startsWith("@/") && !specifier.startsWith(".")) return require(specifier);
    const base = specifier.startsWith("@/") ? path.join(root, specifier.slice(2)) : path.resolve(parent, specifier);
    const filename = [base, `${base}.ts`, `${base}.mjs`].find(file => existsSync(file));
    if (!filename) throw new Error(`Missing module ${base}`);
    if (cache.has(filename)) return cache.get(filename).exports;
    const source = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, allowJs: true } }).outputText;
    const module = { exports: {} }; cache.set(filename, module);
    vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename })(name => load(name, path.dirname(filename)), module, module.exports);
    return module.exports;
  }
  return load;
}
const load = loader();
const { emptyCampaignAudience } = load("@/lib/campaigns/audience-shared");
const { audienceFieldsFromColumns, compileCampaignAudience } = load("@/lib/campaigns/audience-query");
const fields = audienceFieldsFromColumns([{ Field: "email", Type: "varchar(255)" }, { Field: "balance", Type: "decimal(12,2)" }, { Field: "created_at", Type: "datetime" }]);

test("audience fields follow users schema and omit authentication secrets", () => {
  const columns = ["email", "country", "phone", "password", "remember_token", "two_factor_secret", "password_reset_token"].map(Field => ({ Field, Type: "varchar(255)" }));
  assert.deepEqual(audienceFieldsFromColumns(columns).map(field => field.name), ["email", "country", "phone"]);
});
test("author, subscription, verification, purchases and devices filters stay scoped and parameterized", () => {
  const query = compileCampaignAudience({ ...emptyCampaignAudience(), authorIds: [4141, 1691], subscription: "active", verified: "verified", purchases: "none", devices: "has", rules: [{ field: "email", operator: "contains", value: "x%_' OR 1=1" }] }, fields, ["gal-cep", "spunkram-cep"], ["one_time_credit"]);
  assert.ok(query.sql.includes("email_verified_at IS NOT NULL"));
  assert.ok(query.sql.includes("NOT EXISTS (SELECT 1 FROM sold_items"));
  assert.ok(query.sql.includes("ss.paddle_price_id NOT IN (?)"));
  assert.ok(query.sql.includes("GREATEST"));
  assert.ok(!query.sql.includes("OR 1=1"));
  assert.equal(query.sql.match(/\?/g).length, query.params.length);
  assert.ok(query.params.includes("one_time_credit"));
  assert.equal(query.params.at(-1), "%x\\%\\_' OR 1=1%");
});
test("no subscription and no active subscription mean different selections", () => {
  const none = compileCampaignAudience({ ...emptyCampaignAudience(), subscription: "none" }, fields);
  const inactive = compileCampaignAudience({ ...emptyCampaignAudience(), subscription: "no_active" }, fields);
  assert.ok(none.sql.includes("NOT EXISTS")); assert.ok(!none.sql.includes("GREATEST"));
  assert.ok(inactive.sql.includes("NOT EXISTS")); assert.ok(inactive.sql.includes("GREATEST"));
});
test("role filters use the same account roles as user management", () => {
  assert.ok(compileCampaignAudience({ ...emptyCampaignAudience(), role: "author" }, fields).sql.includes("u.access>=2 AND u.access<>100"));
  assert.ok(compileCampaignAudience({ ...emptyCampaignAudience(), role: "buyer" }, fields).sql.includes("u.access IS NULL"));
});
test("advanced fields allow all/any, typed comparisons and empty values; invalid fields/operators fail", () => {
  const input = { ...emptyCampaignAudience(), match: "any", rules: [{ field: "balance", operator: "gte", value: "15.5" }, { field: "created_at", operator: "empty", value: "" }] };
  const query = compileCampaignAudience(input, fields);
  assert.ok(query.sql.includes("u.`balance` >= ? OR u.`created_at` IS NULL"));
  assert.deepEqual(query.params, [15.5]);
  for (const rule of [{ field: "password", operator: "eq", value: "x" }, { field: "email", operator: "raw", value: "x" }, { field: "balance", operator: "contains", value: "1" }, { field: "balance", operator: "eq", value: "NaN" }]) {
    assert.throws(() => compileCampaignAudience({ ...input, rules: [rule] }, fields));
  }
});
test("delivery schema rejects forged senders and header injection; older drafts remain valid", () => {
  const { campaignDeliverySchema } = load("@/lib/campaigns/audience-schema");
  assert.equal(campaignDeliverySchema.safeParse({ provider: "smtp", from_email: "a@example.test", from_name: "A" }).success, false);
  assert.equal(campaignDeliverySchema.safeParse({ provider: "mailgun", from_email: "a@example.test", from_name: "A\nBcc: x" }).success, false);
  const { campaignDraftSchema } = load("@/lib/campaigns/schema");
  const draft = { name: "Legacy", site_origin: "https://motionflow.pro", grant: { kind: "invite", subscription: "premiere_gal", duration: "year", itemId: null }, template: { subject: "Hi", text: "Hello", html: "<p>Hello</p>" }, extension_template: null, recipients_source: "a@example.test" };
  assert.ok(campaignDraftSchema.safeParse(draft).success);
});

test("audience preview/import share filters, normalize and deduplicate recipients, and reject oversize snapshots", async () => {
  let total = 4; const queries = [];
  const audienceLoad = loader({
    "@/lib/db": { getPool: () => ({ query: async () => [[{ Field: "email", Type: "varchar(255)" }]], execute: async (sql, params) => {
      queries.push({ sql, params });
      if (sql.includes("COUNT(*)")) return [[{ total }]];
      return [[{ id: 1, email: " A@example.test ", name: "A" }, { id: 2, email: "a@example.test", name: "Duplicate" }, { id: 3, email: "bad", name: "Invalid" }, { id: 4, email: "b@example.test", first_name: 'B, "Name"', last_name: "Last" }]];
    } }) },
    "@/lib/packages-admin": { listPackagesAuthors: async () => [{ id: 4141 }] },
    "@/lib/cep-client-registry": { getCepClientByAuthorId: () => ({ client: "gal-cep" }) },
    "@/lib/extra-generation-packs": { getExtraGenPacks: () => [] },
    "@/lib/spunkram-paddle-config": { getSpunkramExtraGenPacks: () => [] },
    "./mail": { campaignMailOptions: () => ({}), createCampaignMailingList: async () => "list@example.test" },
  });
  const service = audienceLoad("@/lib/campaigns/audience");
  const preview = await service.campaignAudiencePreview(emptyCampaignAudience(), "preview");
  assert.equal(preview.total, 4); assert.equal(preview.users.length, 2);
  const imported = await service.campaignAudiencePreview(emptyCampaignAudience(), "import");
  const { parseRecipients } = require("../lib/campaigns/core.mjs");
  const recipients = parseRecipients(imported.recipients_source).recipients;
  assert.equal(recipients.length, 2); assert.equal(recipients[1].first_name, 'B, "Name"');
  assert.deepEqual(queries[0].params, queries[2].params);
  total = 5001;
  await assert.rejects(service.campaignAudiencePreview(emptyCampaignAudience(), "import"), /5,000/);
  await assert.rejects(service.campaignAudiencePreview({ ...emptyCampaignAudience(), authorIds: [999] }, "preview"), /available author/);
});

test("Mailgun sender selection, transport, list creation batches and list retries use the real API contracts without live calls", async () => {
  const names = ["MAILGUN_DOMAIN", "MAILGUN_SECRET", "MAILGUN_ENDPOINT", "RESEND_API_KEY", "MAIL_FROM_ADDRESS"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const oldFetch = global.fetch;
  Object.assign(process.env, { MAILGUN_DOMAIN: "mail.example.test", MAILGUN_SECRET: "fixture-key", MAILGUN_ENDPOINT: "api.eu.mailgun.net", RESEND_API_KEY: "fixture-resend", MAIL_FROM_ADDRESS: "hello@example.test" });
  let storedList = null; const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    assert.ok(url.startsWith("https://api.eu.mailgun.net/v3/"));
    if (url.endsWith("/messages")) return Response.json({ id: "<fixture-message>" });
    if (!options.body) return storedList ? Response.json({ list: storedList }) : Response.json({ message: "Not found" }, { status: 404 });
    if (url.endsWith("/lists")) { storedList = Object.fromEntries(options.body); return Response.json({ list: storedList }); }
    return Response.json({ message: "Members added" });
  };
  try {
    const mail = load("@/lib/campaigns/mail");
    const options = mail.campaignMailOptions();
    assert.ok(options.mailgun.configured); assert.ok(options.mailgun.addresses.includes("hello@mail.example.test"));
    assert.throws(() => mail.validateCampaignDelivery({ provider: "mailgun", from_name: "Team", from_email: "other@evil.test" }), /configured/);
    const client = mail.campaignMailClient("mailgun");
    const result = await client.emails.send({ from: "Team <hello@mail.example.test>", to: "a@example.test", subject: "Hi", text: "Hello", html: "<p>Hello</p>" }, { idempotencyKey: "campaign-fixture" });
    assert.equal(result.data.id, "<fixture-message>");
    assert.equal(calls[0].options.body.get("from"), "Team <hello@mail.example.test>");
    const key = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
    const members = Array.from({ length: 1001 }, (_, index) => ({ id: index, name: "User", email: `user${index}@example.test` }));
    const address = await mail.createCampaignMailingList(key, "Audience", members);
    assert.equal(address, `campaign-${key}@mail.example.test`);
    assert.equal(storedList.access_level, "readonly");
    let batches = calls.filter(call => call.url.endsWith("members.json"));
    assert.deepEqual(batches.map(call => JSON.parse(call.options.body.get("members")).length), [1000, 1]);
    await mail.createCampaignMailingList(key, "Audience", members);
    assert.equal(calls.filter(call => call.url.endsWith("/lists") && call.options.body).length, 1);
    await assert.rejects(mail.createCampaignMailingList(key, "Changed", members.slice(0, 1)), /different audience/);
  } finally {
    global.fetch = oldFetch;
    for (const name of names) previous[name] == null ? delete process.env[name] : process.env[name] = previous[name];
  }
});

function senderFixture(provider, send) {
  const recipient = { id: 1, user_id: 101, email: "a@example.test", account_email: "a@example.test", created_user: 0, action: "invite", state: "ready", billing_json: [], outbox_json: null };
  const conn = { beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, execute: async (sql, values) => {
    if (sql.startsWith("SELECT id,email,google_id")) return [[{ id: 101, email: "a@example.test" }]];
    if (sql.includes("state='sending'")) Object.assign(recipient, { state: "sending", outbox_json: values[0], mail_started_at: values[1] });
    if (sql.includes("SET state='ready'")) Object.assign(recipient, { state: "ready", outbox_json: null });
    if (sql.includes("state='sent'")) recipient.state = "sent";
    if (sql.includes("state='skipped'")) recipient.state = "skipped";
    return [{ affectedRows: 1 }];
  } };
  const campaign = { id: "fixture", site_origin: "https://motionflow.pro", grant: { kind: "invite", duration: "month" }, template: { subject: "Hello", text: "Hello", html: "<p>Hello</p>" } };
  return { recipient, conn, campaign, services: { provider, from: "Team <hello@example.test>", mail: { emails: { send } } } };
}
test("Mailgun uncertain delivery never retries automatically, definite rejections can retry", async () => {
  let sends = 0;
  const fixture = senderFixture("mailgun", async () => { sends++; throw new Error("Connection lost"); });
  await assert.rejects(sendRecipient(fixture.conn, fixture.campaign, { ...fixture.recipient }, fixture.services));
  assert.equal(fixture.recipient.state, "sending");
  await assert.rejects(sendRecipient(fixture.conn, fixture.campaign, { ...fixture.recipient }, fixture.services), /uncertain/);
  assert.equal(sends, 1);
  const rejected = senderFixture("mailgun", async () => { throw Object.assign(new Error("Rejected"), { definitelyRejected: true }); });
  await assert.rejects(sendRecipient(rejected.conn, rejected.campaign, { ...rejected.recipient }, rejected.services));
  assert.equal(rejected.recipient.state, "ready");
});
test("campaigns honor unsubscribed Mailgun list members before creating an outbox or sending", async () => {
  let sends = 0;
  const fixture = senderFixture("mailgun", async () => { sends++; return { data: { id: "id" } }; });
  fixture.services.mailingListSubscribed = async () => false;
  await sendRecipient(fixture.conn, fixture.campaign, { ...fixture.recipient }, fixture.services);
  assert.equal(fixture.recipient.state, "skipped"); assert.equal(sends, 0);
});

test("options and audience actions enforce admin access, origin checks and validated filters", async () => {
  let user = null; const actions = [];
  const apiLoad = loader({
    "@/lib/auth/get-session-user": { getSessionUser: async () => user },
    "@/lib/affiliate/admin": { isAffiliateAdmin: user => user.access === 100 },
    "@/lib/campaigns/audience": { campaignAudienceOptions: async () => ({ fields: [] }), campaignAudiencePreview: async (_input, action) => { actions.push(action); return { total: 0, users: [] }; } },
  });
  const { NextRequest } = require("next/server");
  const options = apiLoad("@/app/(main)/api/admin/campaigns/options/route");
  const audience = apiLoad("@/app/(main)/api/admin/campaigns/audience/route");
  const get = () => options.GET(new NextRequest("https://motionflow.test/api/admin/campaigns/options"));
  const post = (body, origin = "https://motionflow.test") => audience.POST(new NextRequest("https://motionflow.test/api/admin/campaigns/audience", { method: "POST", headers: { host: "motionflow.test", origin, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  for (const access of [null, 0]) {
    user = access == null ? null : { access };
    assert.equal((await get()).status, 403);
    assert.equal((await post({ action: "preview", audience: emptyCampaignAudience() })).status, 403);
  }
  user = { access: 100 };
  assert.equal((await get()).status, 200);
  assert.equal((await post({ action: "preview", audience: emptyCampaignAudience() }, "https://evil.test")).status, 403);
  assert.equal((await post({ action: "mailing_list", audience: emptyCampaignAudience() })).status, 400);
  assert.equal((await post({ action: "preview", audience: { ...emptyCampaignAudience(), rules: [{ field: "email`; DROP TABLE users", operator: "eq", value: "x" }] } })).status, 400);
  assert.equal((await post({ action: "preview", audience: emptyCampaignAudience() })).status, 200);
  assert.deepEqual(actions, ["preview"]);
});

test("Resend retries preserve the original idempotency key and personalized payload", async () => {
  const keys = []; let lose = true;
  const fixture = senderFixture("resend", async (payload, options) => {
    keys.push({ payload, key: options.idempotencyKey });
    if (lose) throw new Error("Lost receipt");
    return { data: { id: "fixture-resend" } };
  });
  await assert.rejects(sendRecipient(fixture.conn, fixture.campaign, { ...fixture.recipient }, fixture.services));
  lose = false;
  await sendRecipient(fixture.conn, fixture.campaign, { ...fixture.recipient }, fixture.services);
  assert.equal(fixture.recipient.state, "sent");
  assert.deepEqual(keys[0], keys[1]);
});
