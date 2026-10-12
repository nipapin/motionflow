import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { soldItemAccessCondition } from "../lib/campaigns/core.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
function loader(mocks = {}) {
  const cache = new Map();
  function load(specifier) {
    if (specifier === "server-only") return {};
    if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
    if (specifier === "@/lib/campaigns/core.mjs") return { soldItemAccessCondition };
    if (!specifier.startsWith("@/")) return require(specifier);
    if (cache.has(specifier)) return cache.get(specifier).exports;
    const filename = path.join(root, `${specifier.slice(2)}.ts`);
    const source = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const module = { exports: {} };
    cache.set(specifier, module);
    vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename })(load, module, module.exports);
    return module.exports;
  }
  return load;
}
const load = loader();
const csv = load("@/lib/user-csv");
const filters = load("@/lib/user-list-filters");
const { buildExtensionUsersQuery } = load("@/lib/extension-users-query");

test("CSV preserves commas, quotes, Unicode and newlines; protects formula cells", () => {
  assert.equal(csv.makeCsv(["name"], [['Иван, "Editor"\nМосква']]), 'name\r\n"Иван, ""Editor""\nМосква"\r\n');
  for (const text of ["=1+1", "+SUM(A1)", "@cmd", "-1+1", "  =2", "\tvalue"]) assert.ok(csv.csvCell(text).startsWith("'"));
});
test("Mailgun CSV normalizes and deduplicates addresses, skips empty/invalid emails and preserves plus prefixes", () => {
  assert.equal(csv.makeMailgunCsv([
    { email: " ALEX@example.invalid ", name: "Alex" }, { email: "alex@example.invalid", name: "Duplicate" },
    { email: "", name: "Empty" }, { email: "invalid", name: "Bad" },
    { email: "+tag@example.invalid", name: 'Иван, "Editor"' },
  ]), 'alex@example.invalid\r\n+tag@example.invalid\r\n');
  assert.equal(csv.makeMailgunCsv([]), "");
  assert.equal(csv.makeMailgunCsv([{ email: "Doe <doe@example.invalid>" }, { email: '"bob"@example.invalid' }]), "");
});
test("CSV download is an attachment and cannot be cached", async () => {
  const response = csv.userCsvResponse("user@example.invalid\r\n", "users-mailgun.csv");
  assert.equal(response.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.match(response.headers.get("content-disposition"), /attachment; filename="users-mailgun.csv"/);
  assert.equal(await response.text(), "user@example.invalid\r\n");
});
test("filters reject impossible dates and reversed ranges, handle leap years, and normalize unknown values", () => {
  for (const date of ["2026-02-29", "2026-04-31", "2026-13-01", "garbage"]) {
    assert.ok(filters.validateUserDateRanges(new URLSearchParams({ registeredFrom: date })));
  }
  assert.equal(filters.validateUserDateRanges(new URLSearchParams({ seenFrom: "2028-02-29", seenTo: "2028-02-29" })), null);
  assert.ok(filters.validateUserDateRanges(new URLSearchParams({ seenFrom: "2026-10-12", seenTo: "2026-10-01" })));
  assert.deepEqual(filters.parseExtensionUserFilters(new URLSearchParams({ sub: "oops", mailing: "oops", source: "oops" })), filters.DEFAULT_EXTENSION_USER_FILTERS);
  assert.equal(filters.mailingFilterSql("opted_in"), "u.mailing = 0");
  assert.match(filters.mailingFilterSql("opted_out"), /IS NULL/);
});
test("author selection binds search, dates and scope before pagination, including authors without a CEP client", () => {
  const query = buildExtensionUsersQuery({ authorId: 4141, client: "gal", q: "a%_\\", filters: { sub: "active", source: "admin", sold: "has", devices: "none", mailing: "opted_in", seenTo: "2026-10-12" } });
  assert.equal((query.fromSql.match(/\?/g) ?? []).length, query.params.length);
  assert.deepEqual(query.params, ["gal", 4141, 4141, "gal", "%a\\%\\_\\\\%", "%a\\%\\_\\\\%", "a%_\\", "admin", "2026-10-12"]);
  assert.doesNotMatch(query.orderSql, /LIMIT|OFFSET/);
  assert.match(query.fromSql, /ss\.author_id = 4141/);
  assert.match(query.fromSql, /u\.mailing = 0/);
  const withoutClient = buildExtensionUsersQuery({ authorId: 1691, client: null, filters: { devices: "none" } });
  assert.doesNotMatch(withoutClient.fromSql, /FROM cep_devices/);
  assert.equal((withoutClient.fromSql.match(/\?/g) ?? []).length, withoutClient.params.length);
  assert.throws(() => buildExtensionUsersQuery({ authorId: 1.5, client: null }));
});

for (const [route, accessMock] of [
  ["@/app/(main)/api/admin/users/route", { "@/lib/affiliate/admin": { isAffiliateAdmin: () => false } }],
  ["@/app/(main)/api/extensions/[authorId]/users/route", { "@/lib/packages-admin": { isPackagesAdmin: () => false } }],
]) {
  test(`${route}: CSV and Mailgun exports enforce admin access before querying`, async () => {
    let queried = false;
    const exports = { exportAdminUsers: () => { queried = true; }, exportExtensionUsersForAuthor: () => { queried = true; } };
    const routeLoad = loader({ ...accessMock, "@/lib/auth/get-session-user": { getSessionUser: async () => null }, "@/lib/admin-users": exports, "@/lib/cep-extension-users": exports });
    for (const format of ["csv", "mailgun"]) {
      const response = await routeLoad(route).GET({ nextUrl: new URL(`https://example.invalid/?export=${format}`) }, { params: Promise.resolve({ authorId: "4141" }) });
      assert.equal(response.status, 403);
    }
    assert.equal(queried, false);
  });
}

test("authorized exports pass filters to the selection and reject invalid dates before querying", async () => {
  const calls = [];
  const select = async options => {
    calls.push(options);
    return [{ id: 1, user_id: 1, email: "user@example.invalid", name: "User", access: 0 }];
  };
  const routeLoad = loader({
    "@/lib/auth/get-session-user": { getSessionUser: async () => ({ email: "admin@example.invalid", name: "Admin" }) },
    "@/lib/affiliate/admin": { isAffiliateAdmin: () => true },
    "@/lib/packages-admin": { isPackagesAdmin: () => true, getPackagesAuthorById: async () => ({ id: 4141 }) },
    "@/lib/admin-users": { exportAdminUsers: select },
    "@/lib/cep-extension-users": { exportExtensionUsersForAuthor: select },
  });
  for (const route of ["@/app/(main)/api/admin/users/route", "@/app/(main)/api/extensions/[authorId]/users/route"]) {
    const get = query => routeLoad(route).GET({ nextUrl: new URL(`https://example.invalid/?${query}`) }, { params: Promise.resolve({ authorId: "4141" }) });
    const response = await get("export=mailgun&mailing=opted_in&sub=active&q=user&page=2");
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "user@example.invalid\r\n");
    const options = calls.at(-1);
    assert.equal(options.q, "user");
    assert.equal(options.filters?.mailing ?? options.mailing, "opted_in");
    assert.equal(options.filters?.sub ?? options.subscription, "active");
    const before = calls.length;
    assert.equal((await get("export=csv&registeredFrom=2026-02-30")).status, 400);
    assert.equal(calls.length, before);
  }
});

// Optional MySQL verification uses only synthetic, connection-scoped temporary
// tables. Each table reference gets its own copy to avoid MySQL's temporary-table
// reopen limitation. No production rows are read or written.
test("MySQL: list/count/export agree across pages and author filters", { skip: !process.argv.includes("--database") }, async () => {
  const mysql = await import("mysql2/promise");
  const connection = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD?.replace(/^(["'])(.*)\1$/, "$2"), database: process.env.DB_DATABASE, connectTimeout: 10000 });
  const schemas = {
    users: "id INT, name VARCHAR(255), email VARCHAR(255), first_name VARCHAR(255), last_name VARCHAR(255), access INT, mailing INT NULL, email_verified_at DATETIME NULL, created_at DATETIME, google_id VARCHAR(255), company_name VARCHAR(255), city VARCHAR(255), country VARCHAR(255), subscription_id VARCHAR(255), last_payment_id VARCHAR(255), referred_by_campaign VARCHAR(255)",
    subscription_systems: "id INT, buyer_id INT, author_id INT, status INT, ends_at DATETIME NULL, paddle_billing_period_ends_at DATETIME NULL, `system` VARCHAR(50), plan VARCHAR(50), paddle_product_name VARCHAR(255), paddle_price_id VARCHAR(255), subscription_id VARCHAR(255), payment_id VARCHAR(255)",
    sold_items: "id INT, buyer_id INT, author_id INT, item_id INT, status INT, `system` VARCHAR(50), arguments JSON, purchase_code VARCHAR(255)",
    cep_devices: "id INT, user_id INT, client VARCHAR(50), name VARCHAR(255), ip VARCHAR(50), user_fingerprint TEXT, created_at DATETIME, last_seen_at DATETIME NULL, revoked_at DATETIME NULL",
  };
  const datasets = {
    users: Array.from({ length: 65 }, (_, i) => [i + 1, `User ${i + 1}`, `user${i + 1}@example.invalid`, "", "", 0, i < 60 ? 0 : null, i < 60 ? "2026-10-01 00:00:00" : null, "2026-10-01 12:00:00", "", "", "", "", "", "", ""]),
    subscription_systems: [
      [1, 1, 4141, 1, "2020-01-01", "2099-01-01", "admin", "yearly", "Gal", null, "sub_test1", null],
      [2, 1, 4141, 0, null, null, "paddle", "yearly", "Gal", null, "sub_test2", null],
      [3, 2, 4141, -1, "2099-01-01", null, "paddle", "yearly", "Gal", null, "sub_test3", null],
      [4, 3, 4141, 1, "2020-01-01", null, "paddle", "yearly", "Gal", null, "sub_test4", null],
      [5, 4, 1691, 1, null, null, "paddle", "yearly", "Other author", null, "sub_test5", null],
    ],
    sold_items: [
      [1, 1, 4141, 10, 1, "paddle", "{}", "code1"],
      [2, 5, 4141, 10, 1, "campaign", '{"access_expires_at":"2020-01-01"}', "code2"],
      ...Array.from({ length: 65 }, (_, i) => [i + 3, i + 1, 7777, 10, 1, "paddle", "{}", `bulk${i}`]),
    ],
    cep_devices: [
      [1, 1, "gal", "Device 1", null, null, "2026-10-01", "2026-10-12 23:59:59", null],
      [2, 1, "gal", "Device 2", null, null, "2026-10-01", "2026-10-12 12:00:00", null],
      [3, 3, "gal", "Revoked", null, null, "2026-10-01", "2026-10-12", "2026-10-12"],
    ],
  };
  const tables = [];
  let serial = 0;
  async function execute(sql, params = []) {
    if (sql.includes("cep_client_sessions")) return [[]];
    const references = [];
    const rewritten = sql.replace(/\b(FROM|JOIN)\s+`?(users|subscription_systems|sold_items|cep_devices)`?\b`?/gi, (_, keyword, table) => {
      const name = `export_test_${++serial}`;
      references.push({ name, table });
      return `${keyword} \`${name}\``;
    });
    for (const { name, table } of references) {
      await connection.query(`CREATE TEMPORARY TABLE \`${name}\` (${schemas[table]})`);
      tables.push(name);
      await connection.query(`INSERT INTO \`${name}\` VALUES ?`, [datasets[table]]);
    }
    // The badge query uses its original table name as a qualifier.
    const qualified = rewritten.replaceAll("subscription_systems.", `\`${references.find(r => r.table === "subscription_systems")?.name}\`.`);
    return connection.execute(qualified, params);
  }
  const mocks = {
    "@/lib/db": { getPool: () => ({ execute }) },
    "@/lib/account-audit": {}, "@/lib/user-generation-credits": {},
    "@/lib/extra-generation-packs": { EXTRA_GEN_PACKS: [], isExtraGenerationsPackPriceId: () => false },
    "@/lib/premiere-gal-paddle-config": { PREMIERE_GAL_AUTHOR_ID: 4141 },
    "@/lib/spunkram-paddle-config": { SPUNKRAM_AUTHOR_ID: 1691, resolveSpunkramSubscriptionTierId: () => null },
    "@/lib/cep-auth": {}, "@/lib/cep-client-sessions": { CEP_CLIENT_SESSIONS_TABLE: "cep_client_sessions" },
    "@/lib/cep-device-installs": { listInstallsForDevices: async () => new Map() },
    "@/lib/cep-device-active-packs": {},
    "@/lib/cep-error-reports": { countErrorsForDevices: async () => new Map(), listRecentErrorsForDevices: async () => new Map() },
    "@/lib/cep-client-registry": { getCepClientByAuthorId: id => id === 4141 ? { client: "gal", extensionName: "Gal" } : null },
    "@/lib/cep-entitlements": {}, "@/lib/purchases": {},
    "@/lib/packages-projects": { listVisiblePackagesProjects: async () => [] },
    "@/lib/packages-authors-db": { ensurePackagesProjectsTable: async () => {} },
    "@/lib/cep-presence": { getCepDevicesOnlineMap: async () => new Map() },
    "@/lib/author-subscription-label": { formatAuthorSubscriptionLabel: ({ active }) => active ? "Gal" : null },
  };
  try {
    const dbLoad = loader(mocks);
    const admin = dbLoad("@/lib/admin-users");
    const options = { mailing: "opted_in", verified: "verified", registeredFrom: "2026-10-01", registeredTo: "2026-10-01" };
    const first = await admin.searchAdminUsers(options);
    const second = await admin.searchAdminUsers({ ...options, page: 2 });
    const all = await admin.exportAdminUsers({ ...options, page: 2 });
    assert.equal(first.total, 60); assert.equal(first.users.length, 50); assert.equal(second.users.length, 10); assert.equal(all.length, 60);
    assert.deepEqual(all.map(u => u.id), [...first.users, ...second.users].map(u => u.id));
    assert.equal((await admin.exportAdminUsers({ mailing: "opted_out" })).length, 5);
    assert.equal((await admin.exportAdminUsers({ ...options, q: "user1@example.invalid" }))[0].id, 1);
    const authors = dbLoad("@/lib/cep-extension-users");
    const cases = [
      [{}, [1, 3, 2]],
      [{ sub: "active" }, [1, 2]],
      [{ sub: "none" }, [3]],
      [{ source: "admin" }, [1]],
      [{ source: "paddle" }, [2]],
      [{ sold: "has" }, [1]],
      [{ devices: "has" }, [1]],
      [{ devices: "none" }, [3, 2]],
      [{ seenFrom: "2026-10-12", seenTo: "2026-10-12" }, [1]],
      [{ mailing: "opted_out" }, []],
      [{ registeredFrom: "2026-10-02" }, []],
    ];
    for (const [filters, expected] of cases) {
      const opts = { authorId: 4141, filters };
      const list = await authors.listExtensionUsersForAuthor(opts);
      const exported = await authors.exportExtensionUsersForAuthor(opts);
      assert.equal(list.total, expected.length, JSON.stringify(filters));
      assert.deepEqual(list.users.map(u => u.user_id), expected);
      assert.deepEqual(exported.map(u => u.user_id), expected);
      if (list.users.some(u => u.user_id === 1)) assert.equal(list.users.find(u => u.user_id === 1).subscription_source, "admin");
    }
    const withoutClient = await authors.listExtensionUsersForAuthor({ authorId: 1691, filters: { devices: "none", sub: "active" } });
    assert.deepEqual(withoutClient.users.map(u => u.user_id), [4]);
    const bulk = { authorId: 7777, filters: { mailing: "opted_in" } };
    const bulkFirst = await authors.listExtensionUsersForAuthor(bulk);
    const bulkSecond = await authors.listExtensionUsersForAuthor({ ...bulk, page: 2 });
    const bulkExport = await authors.exportExtensionUsersForAuthor(bulk);
    assert.equal(bulkFirst.total, 60); assert.equal(bulkFirst.users.length, 50); assert.equal(bulkSecond.users.length, 10);
    assert.deepEqual(bulkExport.map(u => u.user_id), [...bulkFirst.users, ...bulkSecond.users].map(u => u.user_id));
  } finally {
    for (const table of tables) await connection.query(`DROP TEMPORARY TABLE IF EXISTS \`${table}\``);
    await connection.end();
  }
});
