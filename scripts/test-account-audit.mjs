import test from "node:test";
import assert from "node:assert/strict";
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

function fixture({ failSet = false, failClear = false, rows = [] } = {}) {
  const events = [];
  let context = null;
  const conn = {
    execute: async (sql, params) => {
      events.push({ kind: "set", sql, params });
      if (failSet) throw new Error("SET_FAILED");
      context = params;
      return [[]];
    },
    query: async (sql) => {
      events.push({ kind: "clear", sql });
      if (failClear) throw new Error("CLEAR_FAILED");
      context = null;
      return [[]];
    },
    release: () => events.push({ kind: "release" }),
    destroy: () => events.push({ kind: "destroy" }),
  };
  const pool = {
    getConnection: async () => conn,
    execute: async (sql, params) => { events.push({ kind: "select", sql, params }); return [rows]; },
  };
  const load = loader({ "@/lib/db": { getPool: () => pool } });
  return { ...load("@/lib/account-audit"), events, conn, context: () => context };
}

test("audit context is on the mutation connection and cannot leak to its next borrower", async () => {
  const f = fixture();
  const result = await f.withAccountAudit({ actorUserId: 7, source: "admin.users" }, async conn => {
    assert.equal(conn, f.conn);
    assert.deepEqual(f.context(), [7, "admin.users"]);
    return "saved";
  });
  assert.equal(result, "saved");
  assert.equal(f.context(), null);
  await f.withAccountAudit({ actorUserId: 42, source: "profile" }, async () => {
    assert.deepEqual(f.context(), [42, "profile"]);
  });
  assert.equal(f.context(), null);
  assert.deepEqual(f.events.map(e => e.kind), ["set", "clear", "release", "set", "clear", "release"]);
});

test("a failed mutation still clears context and preserves its original error", async () => {
  const f = fixture();
  await assert.rejects(f.withAccountAudit({ actorUserId: 7, source: "admin.users" }, async () => {
    throw new Error("MUTATION_FAILED");
  }), /MUTATION_FAILED/);
  assert.equal(f.context(), null);
  assert.deepEqual(f.events.map(e => e.kind), ["set", "clear", "release"]);
});

test("failed context cleanup destroys the connection instead of recycling it", async () => {
  const f = fixture({ failClear: true });
  assert.equal(await f.withAccountAudit({ source: "registration" }, async () => "saved"), "saved");
  assert.deepEqual(f.events.map(e => e.kind), ["set", "clear", "destroy"]);
  const failing = fixture({ failClear: true });
  await assert.rejects(failing.withAccountAudit({ source: "profile" }, async () => { throw new Error("FAILED"); }), /FAILED/);
  assert.deepEqual(failing.events.map(e => e.kind), ["set", "clear", "destroy"]);
});

test("context setup failure prevents the mutation and still cleans up", async () => {
  const f = fixture({ failSet: true });
  let mutated = false;
  await assert.rejects(f.withAccountAudit({ source: "registration" }, async () => { mutated = true; }), /SET_FAILED/);
  assert.equal(mutated, false);
  assert.deepEqual(f.events.map(e => e.kind), ["set", "clear", "release"]);
});

test("history cursors accept full unsigned BIGINT range and reject injection and overflow", () => {
  const f = fixture();
  for (const cursor of ["1", "9007199254740993", "18446744073709551615"]) assert.equal(f.isAccountAuditCursor(cursor), true);
  for (const cursor of ["", "0", "-1", "1.2", "01", "1 OR 1=1", "18446744073709551616"]) assert.equal(f.isAccountAuditCursor(cursor), false);
});

test("history uses stable pagination, parses JSON and retains exact audit IDs", async () => {
  const rows = Array.from({ length: 51 }, (_, i) => ({
    id: String(BigInt("9007199254741100") - BigInt(i)), user_id: 42, actor_user_id: 7,
    actor_name: "Admin", source: "admin.users", action: "updated",
    changes: JSON.stringify({ email: { before: "old@example.test", after: "new@example.test" } }),
    created_at: "2026-10-02T08:00:00.000000Z",
  }));
  const f = fixture({ rows });
  const page = await f.listAccountAudit(42, "18446744073709551615");
  assert.equal(page.entries.length, 50);
  assert.equal(page.nextCursor, rows[49].id);
  assert.equal(page.entries[0].id, rows[0].id);
  assert.deepEqual(page.entries[0].changes.email, { before: "old@example.test", after: "new@example.test" });
  assert.deepEqual(f.events[0].params, [42, "18446744073709551615"]);
  assert.match(f.events[0].sql, /a\.id < \?/);
  assert.match(f.events[0].sql, /ORDER BY a\.id DESC LIMIT 51/);
  const empty = fixture();
  assert.deepEqual(await empty.listAccountAudit(42), { entries: [], nextCursor: null });
  for (const id of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) await assert.rejects(empty.listAccountAudit(id));
  await assert.rejects(empty.listAccountAudit(42, "invalid"));
  assert.equal(empty.events.length, 1);
});

test("history endpoint requires admin access and permits retained history of deleted users", async () => {
  let session = null;
  const calls = [];
  const f = fixture();
  const load = loader({
    "@/lib/auth/get-session-user": { getSessionUser: async () => session },
    "@/lib/affiliate/admin": { isAffiliateAdmin: user => user?.name === "allowed-admin" },
    "@/lib/account-audit": {
      isAccountAuditCursor: f.isAccountAuditCursor,
      listAccountAudit: async (id, cursor) => { calls.push({ id, cursor }); return { entries: [], nextCursor: null }; },
    },
  });
  const route = load("@/app/(main)/api/admin/users/[id]/history/route");
  const { NextRequest } = require("next/server");
  const request = (id = "42", query = "") => route.GET(
    new NextRequest(`https://motionflow.test/api/admin/users/${id}/history${query}`),
    { params: Promise.resolve({ id }) },
  );
  assert.equal((await request()).status, 403);
  session = { id: 42, name: "buyer" };
  assert.equal((await request()).status, 403);
  assert.deepEqual(calls, []);
  session = { id: 7, name: "allowed-admin" };
  for (const id of ["0", "-1", "abc", "1.5", "9007199254740992"]) assert.equal((await request(id)).status, 400);
  for (const query of ["?cursor=", "?cursor=0", "?cursor=abc", "?cursor=18446744073709551616"]) assert.equal((await request("42", query)).status, 400);
  assert.deepEqual(calls, []);
  const retained = await request("404", "?cursor=9007199254740993");
  assert.equal(retained.status, 200);
  assert.equal(retained.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(calls, [{ id: 404, cursor: "9007199254740993" }]);
});
