/** Integration checks use only disposable, randomly named fixture tables. */
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import mysql from "mysql2/promise";
const require = createRequire(import.meta.url);
const prefix = `mf_market_test_${randomBytes(4).toString("hex")}`;
const names = ["market_events", "market_heatmap_visits", "market_heatmap_batches", "market_heatmap_cells", "user_activity", "subscription_downloads", "generation_records", "sold_items", "marketplace_items", "packages_projects", "users"];
const created = [], available = new Set();
const pool = mysql.createPool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD?.trim().replace(/^(["'])(.*)\1$/, "$2"), database: process.env.DB_DATABASE, connectTimeout: 10000, connectionLimit: 5 });
const rewrite = sql => names.filter(name => name !== "users").reduce((value, table) => value.replace(new RegExp(`\\b${table}\\b`, "g"), `${prefix}_${table}`), sql)
  .replace(/\b(FROM|JOIN|INTO|TABLE) users\b/g, `$1 ${prefix}_users`);
const execute = async (sql, params) => sql.includes("information_schema.TABLES")
  ? [[...available].map(name => ({ name }))] : pool.execute(rewrite(sql), params);
const scoped = { query: (sql, params) => pool.query(rewrite(sql), params), execute,
  getConnection: async () => {
    const conn = await pool.getConnection();
    return { execute: (sql, params) => conn.execute(rewrite(sql), params), beginTransaction: () => conn.beginTransaction(),
      commit: () => conn.commit(), rollback: () => conn.rollback(), release: () => conn.release() };
  } };
function load(file, imports = {}) {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, Buffer, URLSearchParams, Date, process: { env: {} }, console, require(name) {
    if (name === "server-only") return {}; if (Object.hasOwn(imports, name)) return imports[name];
    if (!name.startsWith("@/")) return require(name); throw Error(`Unexpected import ${name}`);
  } }); return exports;
}
const shared = load("../lib/market-analytics-shared.ts");
const schema = load("../lib/market-analytics-schema.ts", { "@/lib/db": { getPool: () => scoped } });
const imports = { "@/lib/db": { getPool: () => scoped }, "@/lib/market-analytics-schema": schema, "@/lib/market-analytics-shared": shared };
const ingest = load("../lib/market-analytics-ingest.ts", imports), reader = load("../lib/market-analytics-reader.ts", imports);
const batch = () => ({ id: randomUUID(), visit: randomUUID(), path: "/after-effects", width: 1440, layout: "release-a", heat: true, scroll: 75,
  cells: [{ kind: "dwell", x: 10, y: 30, weight: 500 }, { kind: "click", x: 10, y: 30, weight: 1 }],
  events: [{ id: randomUUID(), action: "view", itemId: 42 }, { id: randomUUID(), action: "select", itemId: 42 }] });
async function create(table, fields) { await scoped.query(`CREATE TABLE ${table} (${fields}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`); created.push(table); available.add(table); }
try {
  await schema.ensureMarketAnalyticsSchema();
  for (const name of names.filter(name => name.startsWith("market_heatmap_") || name === "market_events")) { created.push(name); available.add(name); }
  await create("users", "id BIGINT PRIMARY KEY,name VARCHAR(191),email VARCHAR(191)");
  await create("marketplace_items", "id BIGINT PRIMARY KEY,name VARCHAR(255)");
  await create("packages_projects", "id BIGINT PRIMARY KEY,name VARCHAR(255)");
  await create("subscription_downloads", "id BIGINT PRIMARY KEY,user_id BIGINT,item_id BIGINT,created_at DATETIME(3)");
  await create("generation_records", "id BIGINT PRIMARY KEY,user_id BIGINT,tool VARCHAR(32),status VARCHAR(16),settings JSON,created_at DATETIME(3)");
  await create("sold_items", "id BIGINT PRIMARY KEY,buyer_id BIGINT,item_id BIGINT,status INT,sold_price DECIMAL(10,2),`system` VARCHAR(32),created_at DATETIME(3)");
  await create("user_activity", "id BIGINT PRIMARY KEY,user_id BIGINT,category VARCHAR(24),action VARCHAR(64),status VARCHAR(24),resource_type VARCHAR(32),resource_id VARCHAR(191),resource_name VARCHAR(255),source VARCHAR(16),legacy_download_id BIGINT NULL,created_at DATETIME(3)");
  await execute("INSERT INTO users VALUES (7,'Fixture User','fixture@example.test')");
  await execute("INSERT INTO marketplace_items VALUES (42,'Motion Essentials')");
  await execute("INSERT INTO packages_projects VALUES (9,'Toolkit')");
  const first = batch();
  await ingest.ingestTelemetry(first, 7); await ingest.ingestTelemetry(first, 7);
  let [counts] = await execute("SELECT (SELECT COUNT(*) FROM market_events) AS events,(SELECT COUNT(*) FROM market_heatmap_visits) AS visits,(SELECT SUM(weight) FROM market_heatmap_cells WHERE kind='dwell') AS weight");
  assert.deepEqual([Number(counts[0].events), Number(counts[0].visits), Number(counts[0].weight)], [2, 1, 500]);
  await ingest.ingestTelemetry({ ...first, id: randomUUID(), scroll: 100 }, 7);
  [counts] = await execute("SELECT (SELECT COUNT(*) FROM market_events) AS events,(SELECT COUNT(*) FROM market_heatmap_visits) AS visits,(SELECT SUM(weight) FROM market_heatmap_cells WHERE kind='dwell') AS weight");
  assert.deepEqual([Number(counts[0].events), Number(counts[0].visits), Number(counts[0].weight)], [2, 1, 1000]);
  const guest = batch(); guest.width = 400; guest.events = [guest.events[0]];
  await ingest.ingestTelemetry(guest, null);
  const incompatible = { ...first, id: randomUUID(), width: 1024, events: [{ id: randomUUID(), action: "view", itemId: 42 }] };
  await assert.rejects(ingest.ingestTelemetry(incompatible, 7));
  const [rollback] = await execute("SELECT COUNT(*) AS n FROM market_heatmap_batches WHERE id=?", [incompatible.id]);
  assert.equal(Number(rollback[0].n), 0);
  console.log("PASS: idempotent packet delivery, deduplicated event IDs, aggregate cells, viewport isolation and transaction rollback");

  await execute("INSERT INTO subscription_downloads VALUES (1,7,42,NOW(3)),(2,7,42,NOW(3))");
  await execute("INSERT INTO user_activity VALUES (1,7,'download','marketplace_download','issued','marketplace_item','42','Motion Essentials','web',1,NOW(3)),(2,7,'download','marketplace_download','failed','marketplace_item','42','Motion Essentials','web',NULL,NOW(3)),(3,7,'generation','generation','ok','tool','captions',NULL,'extension',NULL,NOW(3)),(4,7,'extension','pack_activated','observed','extension_pack','9','Toolkit','extension',NULL,NOW(3))");
  await execute("INSERT INTO generation_records VALUES (1,7,'video','ok',?,NOW(3)),(2,7,'video','failed',?,NOW(3))", [JSON.stringify({ _activity_source: "web", prompt: "SECRET_PROMPT" }), JSON.stringify({ prompt: "SECRET_PROMPT" })]);
  await execute("INSERT INTO sold_items VALUES (1,7,42,1,20,'paddle',NOW(3)),(2,7,42,0,20,'paddle',NOW(3)),(3,7,42,1,20,'campaign',NOW(3)),(4,7,42,1,0,'paddle',NOW(3))");
  await execute("INSERT INTO market_events (id,user_id,visit_id,action,resource_type,resource_id,path) VALUES (?,7,?,'favorite','marketplace_item','42','/')", [randomUUID(), randomUUID()]);
  const [[today]] = await execute("SELECT DATE_FORMAT(CURRENT_DATE,'%Y-%m-%d') AS day");
  const filters = { from: today.day, to: today.day, page: 1, sort: "downloads" };
  const overview = await reader.readMarketOverview(filters);
  assert.deepEqual(JSON.parse(JSON.stringify(overview.totals)), { view: 2, select: 1, favorite: 1, download: 2, purchase: 1, generation: 2, extension: 1, users: 1, failures: 2 });
  assert.equal(overview.resources.find(row => row.id === "42").name, "Motion Essentials");
  assert.equal(overview.eventTotal, 12); assert.equal(overview.resourceTotal, 4);
  assert.ok(!JSON.stringify(overview).includes("SECRET_PROMPT"));
  const detail = await reader.readMarketOverview({ ...filters, resourceType: "marketplace_item", resourceId: "42" });
  assert.ok(detail.events.every(event => event.resourceId === "42")); assert.equal(detail.users.length, 2);
  const web = await reader.readMarketOverview({ ...filters, source: "web" });
  assert.equal(web.totals.download, 1); assert.equal(web.totals.purchase, 0);
  assert.equal((await reader.readMarketOverview({ ...filters, scope: "ai" })).resourceTotal, 2);
  assert.equal((await reader.readMarketOverview({ ...filters, search: "%" })).eventTotal, 0);
  console.log("PASS: global counts, paid purchases versus grants/cancellations, legacy download deduplication, material-to-users drilldown, source/scope/search filters and redaction");

  const heat = await reader.readMarketHeatmap(today.day, today.day, first.path, 1440, first.layout);
  assert.equal(heat.pages.length, 2); assert.equal(heat.visits, 1);
  assert.equal(heat.cells.find(cell => cell.kind === "dwell").weight, 1000);
  assert.equal(heat.scroll.find(row => row.depth === 100).visits, 1);
  assert.ok(!JSON.stringify(heat).includes("fixture@example.test"));
  assert.ok(!JSON.stringify(heat).includes("userId"));
  console.log("PASS: page/width/layout heatmap selection, scroll reach and anonymous aggregate-only heatmap reports");
} finally {
  for (const table of created.reverse()) { try { await pool.query(`DROP TABLE IF EXISTS \`${prefix}_${table}\``); } catch (error) { console.error('Could not remove fixture '+table,error.code); } }
  await pool.end();
}
