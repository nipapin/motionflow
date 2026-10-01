import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);

function loader(mocks) {
  const cache = new Map();
  function load(specifier) {
    if (specifier === "server-only") return {};
    if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
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

function fixture({ exists = true, tables = [], failOn, affectedRows = 1 } = {}) {
  const events = [];
  const queries = [];
  const conn = {
    beginTransaction: async () => { events.push("begin"); },
    commit: async () => { events.push("commit"); },
    rollback: async () => { events.push("rollback"); },
    release: () => { events.push("release"); },
    execute: async (sql, params = []) => {
      queries.push({ sql, params });
      if (failOn && sql.includes(failOn)) throw new Error("DATABASE_FAILURE");
      if (sql.startsWith("SELECT email")) return [exists ? [{ email: "user@example.test" }] : []];
      if (sql.includes("information_schema.TABLES")) return [tables.map(tableName => ({ tableName }))];
      return [{ affectedRows }];
    },
  };
  const pool = { getConnection: async () => { events.push("connect"); return conn; } };
  const load = loader({ "@/lib/db": { getPool: () => pool } });
  return { ...load("@/lib/admin-user-deletion"), events, queries, load };
}

test("self-deletion is rejected before acquiring a connection", async () => {
  const f = fixture();
  await assert.rejects(f.deleteAdminUser(7, 7), { code: "SELF_DELETE_FORBIDDEN" });
  assert.deepEqual(f.events, []);
});

test("invalid user IDs never reach the database", async () => {
  const f = fixture();
  for (const id of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(f.deleteAdminUser(id, 7), { code: "NOT_FOUND" });
  }
  assert.deepEqual(f.events, []);
});

test("missing account rolls back and releases the connection", async () => {
  const f = fixture({ exists: false });
  await assert.rejects(f.deleteAdminUser(42, 7), { code: "NOT_FOUND" });
  assert.deepEqual(f.events, ["connect", "begin", "rollback", "release"]);
  assert.equal(f.queries.length, 1);
});

test("deletion removes account access and preserves financial history", async () => {
  const f = fixture({ tables: [
    "users", "cep_devices", "cep_device_active_packs", "cep_device_installs",
    "cep_auth_sessions", "cep_client_sessions", "cep_error_reports", "sessions",
    "user_favorites", "user_followings", "user_generation_credits",
    "password_reset_tokens", "password_resets", "email_verification_tokens",
    "sold_items", "subscription_systems", "subscription_payments", "affiliate_commissions",
  ] });
  await f.deleteAdminUser(42, 7);
  assert.deepEqual(f.events, ["connect", "begin", "commit", "release"]);
  assert.equal(f.queries[0].sql, "SELECT email FROM users WHERE id = ? FOR UPDATE");
  assert.ok(f.queries.some(q => q.sql.includes("device.id = child.device_id") && q.params[0] === 42));
  assert.ok(f.queries.some(q => q.sql.includes("cep_auth_sessions") && q.params[0] === 42));
  assert.ok(f.queries.some(q => q.sql.includes("following_id = ?") && q.params.length === 2));
  for (const q of f.queries.filter(q => q.sql.includes("WHERE email = ?"))) {
    assert.deepEqual(q.params, ["user@example.test"]);
  }
  assert.equal(f.queries.filter(q => q.sql.includes("WHERE email = ?")).length, 3);
  assert.ok(!f.queries.some(q => /sold_items|subscription_systems|subscription_payments|affiliate_commissions/.test(q.sql)));
  assert.deepEqual(f.queries.at(-1), { sql: "DELETE FROM users WHERE id = ?", params: [42] });
});

test("absent optional tables do not prevent account deletion", async () => {
  const f = fixture({ tables: ["users"] });
  await f.deleteAdminUser(42, 7);
  assert.equal(f.queries.length, 3);
  assert.ok(f.events.includes("commit"));
});

test("cleanup failure rolls back instead of partially deleting the account", async () => {
  const f = fixture({ tables: ["cep_devices", "cep_auth_sessions"], failOn: "DELETE FROM `cep_devices`" });
  await assert.rejects(f.deleteAdminUser(42, 7), /DATABASE_FAILURE/);
  assert.deepEqual(f.events, ["connect", "begin", "rollback", "release"]);
  assert.ok(!f.queries.some(q => q.sql === "DELETE FROM users WHERE id = ?"));
});

test("a failed final delete rolls back earlier cleanup", async () => {
  const f = fixture({ affectedRows: 0 });
  await assert.rejects(f.deleteAdminUser(42, 7), { code: "NOT_FOUND" });
  assert.deepEqual(f.events, ["connect", "begin", "rollback", "release"]);
});

test("DELETE endpoint enforces admin access, confirmation, valid IDs and self protection", async () => {
  let session = null;
  const deleted = [];
  const f = fixture();
  const load = loader({
    "@/lib/auth/get-session-user": { getSessionUser: async () => session },
    "@/lib/affiliate/admin": { isAffiliateAdmin: user => user?.access === 100 },
    "@/lib/admin-users": { getAdminUserById: async id => ({ id }) },
    "@/lib/admin-user-grants": {
      listAdminUserPurchases: async () => [],
      listAdminUserSubscriptions: async () => [],
    },
    "@/lib/admin-user-deletion": {
      AdminUserDeletionError: f.AdminUserDeletionError,
      deleteAdminUser: async (id, actor) => {
        if (id === actor) throw new f.AdminUserDeletionError("SELF_DELETE_FORBIDDEN");
        if (id === 404) throw new f.AdminUserDeletionError("NOT_FOUND");
        deleted.push({ id, actor });
      },
    },
  });
  const route = load("@/app/(main)/api/admin/users/[id]/route");
  const { NextRequest } = require("next/server");
  const request = (body = { confirm: true }, id = "42") => route.DELETE(
    new NextRequest(`https://motionflow.test/api/admin/users/${id}`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
  assert.equal((await request()).status, 403);
  session = { id: 7, access: 0 };
  assert.equal((await request()).status, 403);
  session = { id: 7, access: 100 };
  for (const id of ["7", "42"]) {
    const detail = await route.GET(
      new NextRequest(`https://motionflow.test/api/admin/users/${id}`),
      { params: Promise.resolve({ id }) },
    );
    assert.equal(detail.status, 200);
    assert.equal((await detail.json()).canDelete, id !== "7");
  }
  for (const body of [{}, { confirm: false }, { confirm: "true" }, { confirm: true, adminUserId: 99 }]) {
    assert.equal((await request(body)).status, 400);
  }
  const malformed = await route.DELETE(
    new NextRequest("https://motionflow.test/api/admin/users/42", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: "{",
    }),
    { params: Promise.resolve({ id: "42" }) },
  );
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error, "INVALID_JSON");
  for (const id of ["0", "-1", "abc", "1.5", "9007199254740992"]) {
    assert.equal((await request({ confirm: true }, id)).status, 400);
  }
  const self = await request({ confirm: true }, "7");
  assert.equal(self.status, 409);
  assert.equal((await self.json()).error, "SELF_DELETE_FORBIDDEN");
  assert.equal((await request({ confirm: true }, "404")).status, 404);
  assert.deepEqual(deleted, []);
  const success = await request();
  assert.equal(success.status, 200);
  assert.deepEqual(await success.json(), { ok: true });
  assert.deepEqual(deleted, [{ id: 42, actor: 7 }]);
});
