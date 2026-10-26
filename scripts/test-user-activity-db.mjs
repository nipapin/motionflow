/** Real SQL on disposable fixture tables. No production user records are read or changed. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import mysql from "mysql2/promise";

const prefix = `mf_activity_test_${randomBytes(5).toString("hex")}`;
const tables = ["user_activity", "subscription_downloads", "generation_records", "cep_client_sessions",
  "cep_devices", "cep_device_installs", "cep_device_active_packs", "packages_projects"];
const rewrite = sql => tables.reduce((text, table) => text.replace(new RegExp(`\\b${table}\\b`, "g"), `${prefix}_${table}`), sql);
const pool = mysql.createPool({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 3306), user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD?.trim().replace(/^(["'])(.*)\1$/, "$2"), database: process.env.DB_DATABASE,
  connectTimeout: 10000, connectionLimit: 4,
});
const wrapConnection = conn => ({
  execute: (sql, params) => conn.execute(rewrite(sql), params), query: (sql, params) => conn.query(rewrite(sql), params),
  beginTransaction: () => conn.beginTransaction(), commit: () => conn.commit(), rollback: () => conn.rollback(), release: () => conn.release(),
});
const scopedPool = {
  execute: (sql, params) => pool.execute(rewrite(sql), params), query: (sql, params) => pool.query(rewrite(sql), params),
  getConnection: async () => wrapConnection(await pool.getConnection()),
};
function load(file, imports) {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, Buffer, Response, console, require(name) {
    if (name === "server-only") return {};
    if (!Object.hasOwn(imports, name)) throw new Error(`Unexpected import ${name}`);
    return imports[name];
  } });
  return exports;
}
const writer = load("../lib/user-activity.ts", { "@/lib/db": { getPool: () => scopedPool } });
const reader = load("../lib/user-activity-reader.ts", {
  "@/lib/db": { getPool: () => scopedPool }, "@/lib/user-activity": writer,
  "@/lib/market-items": { getMarketItemsByIds: async ids => ids.map(id => ({ id, name: `Item ${id}` })) },
});
const created = [];
async function create(table, columns) {
  await scopedPool.query(`CREATE TABLE ${table} (${columns}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  created.push(table);
}
try {
  await scopedPool.query(readFileSync(new URL("../db/migrations/2026_10_26_user_activity.sql", import.meta.url), "utf8"));
  created.push("user_activity");
  await writer.ensureUserActivitySchema();
  await create("subscription_downloads", "id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, user_id BIGINT UNSIGNED, item_id BIGINT UNSIGNED, created_at DATETIME(3), KEY user_date(user_id, created_at)");
  await create("generation_records", "id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, user_id BIGINT UNSIGNED, tool VARCHAR(32), status VARCHAR(16), settings JSON, result JSON, error_message TEXT, created_at DATETIME(3), KEY user_date(user_id, created_at)");
  await create("cep_client_sessions", "id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, user_id BIGINT UNSIGNED, device_id BIGINT UNSIGNED, client VARCHAR(64), host_app_id VARCHAR(16), host_app_name VARCHAR(64), host_version VARCHAR(64), extension_version VARCHAR(64), reported_at DATETIME(3), KEY user_date(user_id, reported_at)");
  const input = { userId: 7, action: "marketplace_download", resourceType: "marketplace_item", resourceId: 42, source: "web" };
  await writer.withDownloadActivity(input, async activity => {
    const [download] = await scopedPool.execute("INSERT INTO subscription_downloads (user_id,item_id,created_at) VALUES (7,42,NOW(3))");
    await activity.linkLegacyDownload(download.insertId);
    activity.issued("redirect");
    return new Response(null, { status: 303, headers: { Location: "https://fixture.test?token=SECRET_URL" } });
  });
  await writer.withDownloadActivity(input, async () => new Response(null, { status: 502 }));
  await writer.withDownloadActivity({ ...input, userId: 8 }, async activity => { activity.issued("stream"); return new Response("file"); });
  const first = await reader.listUserActivity(7);
  assert.equal(first.entries.length, 2, "linked legacy row must not duplicate a new download event");
  assert.deepEqual(new Set(first.entries.map(entry => entry.status)), new Set(["failed", "issued"]));
  assert.ok(!JSON.stringify(first).includes("SECRET_URL"));
  console.log("PASS: migration, real download persistence, user isolation, legacy deduplication, no signed URLs");

  for (let i = 1; i <= 61; i++) {
    await scopedPool.execute("INSERT INTO subscription_downloads (user_id,item_id,created_at) VALUES (7,42,'2026-01-01 12:00:00')");
    await scopedPool.execute("INSERT INTO generation_records (user_id,tool,status,settings,result,error_message,created_at) VALUES (7,'video','ok',?, ?, 'SECRET_ERROR', '2026-01-01 12:00:00')", [JSON.stringify({ prompt: "SECRET_PROMPT", _activity_source: "web" }), JSON.stringify({ url: "SECRET_RESULT" })]);
    await scopedPool.execute("INSERT INTO cep_client_sessions (user_id,device_id,client,host_app_id,host_app_name,host_version,extension_version,reported_at) VALUES (7,1,'gal-cep','PPRO','Premiere Pro','26','1.3.3','2026-01-01 12:00:00')");
    await scopedPool.execute("INSERT INTO user_activity (user_id,category,action,resource_type,source,status,details,created_at) VALUES (7,'extension','pack_activated','extension_pack','extension','observed','{}','2026-01-01 12:00:00')");
  }
  let cursor, all = [];
  do {
    const page = await reader.listUserActivity(7, { cursor });
    assert.ok(page.entries.length <= 50);
    all.push(...page.entries);
    cursor = page.nextCursor ? reader.decodeActivityCursor(page.nextCursor) : null;
    if (page.nextCursor) assert.ok(cursor);
  } while (cursor);
  assert.equal(all.length, 246);
  assert.equal(new Set(all.map(entry => entry.id)).size, 246, "no duplicates across tied timestamps and overlapping source IDs");
  assert.ok(!JSON.stringify(all).includes("SECRET_"));
  for (const category of ["download", "generation", "extension"]) {
    let next, filtered = [];
    do {
      const page = await reader.listUserActivity(7, { category, cursor: next });
      filtered.push(...page.entries);
      next = page.nextCursor ? reader.decodeActivityCursor(page.nextCursor) : null;
    } while (next);
    assert.equal(filtered.length, all.filter(entry => entry.category === category).length);
    assert.ok(filtered.every(entry => entry.category === category));
  }
  console.log("PASS: 246 events paginated without gaps/duplicates, tied dates, all category filters, prompts/results/errors redacted");

  await create("cep_devices", "id BIGINT UNSIGNED PRIMARY KEY, user_id BIGINT UNSIGNED");
  await create("packages_projects", "id BIGINT UNSIGNED PRIMARY KEY, author_id BIGINT UNSIGNED, name VARCHAR(255), host VARCHAR(32), version VARCHAR(64), deleted_at DATETIME NULL");
  // Create through the actual lazy schema to exercise the exact panel SQL.
  const packActivity = load("../lib/pack-activity.ts", { "@/lib/user-activity": writer });
  const imports = { "@/lib/db": { getPool: () => scopedPool }, "@/lib/user-activity": writer,
    "@/lib/pack-activity": packActivity, "@/lib/packages-authors-db": { packagesProjectsTableName: () => "packages_projects" } };
  const installs = load("../lib/cep-device-installs.ts", imports);
  const active = load("../lib/cep-device-active-packs.ts", imports);
  await scopedPool.execute("INSERT INTO cep_devices VALUES (1,7),(2,8)");
  await scopedPool.execute("INSERT INTO packages_projects VALUES (1,6,'Pack one','premiere','1',NULL),(2,6,'Pack two','premiere','1',NULL),(3,99,'Other author','premiere','1',NULL)");
  created.push("cep_device_installs", "cep_device_active_packs");
  const report = packs => installs.replaceCepDeviceInstalls({ userId: 7, deviceId: 1, authorId: 6, packs });
  assert.equal((await report([{ pack_id: 1, version: "1" }, { pack_id: 3 }])).rejected, 1);
  await report([{ pack_id: 1, version: "1" }]);
  // Identical concurrent snapshots must produce exactly one version change.
  await Promise.all([report([{ pack_id: 1, version: "2" }]), report([{ pack_id: 1, version: "2" }])]);
  await report([{ pack_id: 2, version: "1" }]);
  await active.replaceCepDeviceActivePacks({ userId: 7, deviceId: 1, authorId: 6, packIds: [2] });
  await active.replaceCepDeviceActivePacks({ userId: 7, deviceId: 1, authorId: 6, packIds: [2] });
  await active.replaceCepDeviceActivePacks({ userId: 7, deviceId: 1, authorId: 6, packIds: [] });
  await assert.rejects(installs.replaceCepDeviceInstalls({ userId: 7, deviceId: 2, authorId: 6, packs: [] }));
  const [changes] = await scopedPool.execute("SELECT action, resource_id, details FROM user_activity WHERE user_id=7 AND created_at > '2026-01-02' AND category='extension' ORDER BY id");
  assert.deepEqual(changes.map(change => change.action), ["pack_installed", "pack_updated", "pack_installed", "pack_removed", "pack_activated", "pack_deactivated"]);
  console.log("PASS: real panel reports, ownership, author filtering, transactional changes, concurrent heartbeat deduplication");
} finally {
  for (const table of [...created].reverse()) {
    try { await pool.query(`DROP TABLE IF EXISTS \`${prefix}_${table}\``); }
    catch (error) { console.error(`Could not clean fixture table ${prefix}_${table}:`, error.code); }
  }
  await pool.end();
}
