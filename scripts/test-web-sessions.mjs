import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import * as jose from "jose";
import bcrypt from "bcryptjs";
import { serialize } from "php-serialize";

const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");
const root = fileURLToPath(new URL("../", import.meta.url));
process.env.AUTH_SECRET = "web-session-test-key-only";
process.env.APP_KEY = `base64:${Buffer.alloc(32, 7).toString("base64")}`;
const flags = { hasGoogleLinked: false, canChangePassword: true };
const oldPassword = "original-password";
const nextPassword = "replacement-password";

function loader(mocks) {
  const cache = new Map();
  function load(specifier, parent = root) {
    if (specifier === "server-only") return {};
    if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
    if (specifier === "jose") return jose;
    if (!specifier.startsWith("@/") && !specifier.startsWith(".")) return require(specifier);
    const filename = specifier.startsWith("@/")
      ? path.join(root, `${specifier.slice(2)}.ts`)
      : path.resolve(parent, `${specifier}.ts`);
    if (cache.has(filename)) return cache.get(filename).exports;
    const source = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const module = { exports: {} };
    cache.set(filename, module);
    vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename })(
      s => load(s, path.dirname(filename)), module, module.exports,
    );
    return module.exports;
  }
  return load;
}

async function fixture() {
  const user = { id: 42, email: "buyer@example.test", name: "Buyer", password: await bcrypt.hash(oldPassword, 4), remember_token: "remember-old" };
  const versions = new Map();
  const redisValues = new Map();
  const sqlCalls = [];
  const failures = { redis: false, update: false, db: false, raced: false };
  let snapshot;
  const execute = async (sql, params = []) => {
    sqlCalls.push(sql);
    if (failures.db) throw new Error("DATABASE_UNAVAILABLE");
    if (sql.startsWith("SET ")) return [[]];
    if (sql.startsWith("SELECT version")) return [versions.has(params[0]) ? [{ version: versions.get(params[0]) }] : []];
    if (sql.includes("INSERT INTO user_web_session_versions")) {
      versions.set(params[0], (versions.get(params[0]) ?? 0) + 1);
      return [{ affectedRows: 1 }];
    }
    if (sql.includes("FROM users") && !sql.includes("SELECT d.id")) {
      if (sql.includes("FOR UPDATE") && failures.raced) {
        versions.set(user.id, (versions.get(user.id) ?? 0) + 1);
      }
      return [[{ ...user, session_version: versions.get(user.id) ?? 0 }]];
    }
    if (sql.startsWith("UPDATE users SET password")) {
      if (failures.update) throw new Error("UPDATE_FAILED");
      user.password = params[0];
      if (sql.includes("remember_token = NULL")) user.remember_token = null;
      return [{ affectedRows: 1 }];
    }
    if (sql.includes("SELECT d.id AS device_id")) return [[{ device_id: 7, user_id: user.id, email: user.email, name: user.name, client: "spunkram-cep" }]];
    if (sql.includes("last_seen_at")) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  const connection = {
    execute, query: execute, release() {}, destroy() {},
    async beginTransaction() { snapshot = { user: { ...user }, versions: new Map(versions) }; },
    async commit() { snapshot = null; },
    async rollback() { Object.assign(user, snapshot.user); versions.clear(); for (const [key, value] of snapshot.versions) versions.set(key, value); snapshot = null; },
  };
  const pool = { execute, async query() { return [[]]; }, async getConnection() { return connection; } };
  const redis = {
    async connect() {},
    async get(key) { return redisValues.get(key); },
    async setex(key, ttl, value) { if (failures.redis) throw new Error("REDIS_UNAVAILABLE"); redisValues.set(key, value); },
    async del(key) { redisValues.delete(key); },
  };
  const load = loader({
    "@/lib/db": { getPool: () => pool },
    "@/lib/redis": { getRedis: () => redis },
    "@/lib/auth/google-account": { resolveAuthUserFlags: async () => flags },
    "@/lib/auth/user-payload": { authUserPayloadFromRow: async row => ({ id: row.id, email: row.email, name: row.name, ...flags }) },
    "@/lib/auth/email-verification": { hasPendingEmailVerification: async () => false },
    "@/lib/affiliate/attribution": { affiliateRefSlugFromRequest: () => null, attachAffiliateReferralToUser: async () => {} },
  });
  const session = load("@/lib/auth/session");
  const laravel = load("@/lib/auth/laravel-session");
  const route = load("@/app/(main)/api/auth/profile/route");
  const token = await session.signSessionToken(user);
  const laravelId = await laravel.createLaravelSession(user.id);
  const cookie = `${session.SESSION_COOKIE_NAME}=${token}; ${session.LARAVEL_COOKIE_NAME}=${laravel.encryptLaravelCookie(laravelId)}`;
  const change = (body = {}, cookies = cookie) => route.PATCH(new NextRequest("https://motionflow.test/api/auth/profile", {
    method: "PATCH", headers: { cookie: cookies, "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword: oldPassword, newPassword: nextPassword, newPassword_confirmation: nextPassword, ...body }),
  }));
  return { ...session, laravel, load, user, token, laravelId, versions, redisValues, sqlCalls, failures, cookie, change };
}

test("unchecked/omitted option changes the password and preserves both kinds of other website sessions", async () => {
  for (const option of [undefined, false]) {
    const f = await fixture();
    const response = await f.change({ logoutOtherSessions: option });
    assert.equal(response.status, 200);
    assert.ok(await bcrypt.compare(nextPassword, f.user.password));
    assert.ok(await f.verifySessionToken(f.token));
    assert.equal(await f.laravel.readLaravelSessionUserId(f.laravelId), 42);
    assert.equal(f.versions.size, 0);
    assert.equal(f.user.remember_token, "remember-old");
  }
});

test("checked option revokes old JWTs, legacy JWTs and Laravel sessions, preserving the current browser and CEP", async () => {
  const f = await fixture();
  const legacy = await new jose.SignJWT({ email: f.user.email, name: f.user.name }).setProtectedHeader({ alg: "HS256" }).setSubject("42").setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  const otherUserToken = await f.signSessionToken({ id: 99, email: "other@example.test", name: "Other" });
  // Pre-feature Laravel sessions do not carry a version.
  f.redisValues.set("motionflow_database_motionflow_cache_:legacy", serialize(serialize({ login_web_59ba36addc2b2f9401580f014c7f58ea4e30989d: 42 })));
  assert.ok(await f.verifySessionToken(legacy));
  assert.equal(await f.laravel.readLaravelSessionUserId("legacy"), 42);
  const response = await f.change({ logoutOtherSessions: true });
  assert.equal(response.status, 200);
  assert.equal(f.versions.get(42), 1);
  assert.equal(f.user.remember_token, null);
  assert.equal(await f.verifySessionToken(f.token), null);
  assert.equal(await f.verifySessionToken(legacy), null);
  assert.equal(await f.laravel.readLaravelSessionUserId(f.laravelId), null);
  assert.equal(await f.laravel.readLaravelSessionUserId("legacy"), null);
  assert.ok(await f.verifySessionToken(otherUserToken));
  const newToken = response.cookies.get(f.SESSION_COOKIE_NAME).value;
  assert.equal((await f.verifySessionToken(newToken)).sessionVersion, 1);
  const newLaravelId = f.laravel.decryptLaravelCookie(response.cookies.get(f.LARAVEL_COOKIE_NAME).value);
  assert.equal(await f.laravel.readLaravelSessionUserId(newLaravelId), 42);
  assert.equal((await f.change({}, f.cookie)).status, 401);
  const laravelOnly = `${f.LARAVEL_COOKIE_NAME}=${f.laravel.encryptLaravelCookie(f.laravelId)}`;
  assert.equal((await f.change({}, laravelOnly)).status, 401);
  const cep = await f.load("@/lib/cep-auth").resolveCepToken(`mfcep_${"a".repeat(64)}`);
  assert.equal(cep.id, 42);
  assert.ok(f.sqlCalls.every(sql => !/UPDATE.*cep.*revoked_at/i.test(sql)));
});

test("Laravel-only current browser can revoke sessions and stays authenticated", async () => {
  const f = await fixture();
  const response = await f.change({ logoutOtherSessions: true }, `${f.LARAVEL_COOKIE_NAME}=${f.laravel.encryptLaravelCookie(f.laravelId)}`);
  assert.equal(response.status, 200);
  assert.ok(await f.verifySessionToken(response.cookies.get(f.SESSION_COOKIE_NAME).value));
});

test("wrong password, bad confirmation and a non-boolean option cannot revoke sessions", async () => {
  const f = await fixture();
  for (const body of [{ currentPassword: "wrong" }, { newPassword_confirmation: "mismatch" }, { logoutOtherSessions: "true" }]) {
    assert.equal((await f.change({ logoutOtherSessions: true, ...body })).status, 422);
    assert.ok(await f.verifySessionToken(f.token));
    assert.equal(f.versions.size, 0);
  }
  const schema = f.load("@/lib/validations/profile").profilePatchSchema;
  assert.equal(schema.safeParse({ name: "Buyer", logoutOtherSessions: true }).success, false);
});

test("Redis or password update failure rolls back password, remember token and revocation together", async () => {
  for (const failure of ["redis", "update"]) {
    const f = await fixture();
    f.failures[failure] = true;
    const response = await f.change({ logoutOtherSessions: true });
    assert.equal(response.status, 500);
    assert.ok(await bcrypt.compare(oldPassword, f.user.password));
    assert.equal(f.versions.size, 0);
    assert.equal(f.user.remember_token, "remember-old");
    assert.ok(await f.verifySessionToken(f.token));
    assert.equal(await f.laravel.readLaravelSessionUserId(f.laravelId), 42);
  }
});

test("a version changed during password verification cannot be upgraded into a fresh session", async () => {
  const f = await fixture();
  f.failures.raced = true;
  assert.equal((await f.change({ logoutOtherSessions: true })).status, 401);
  assert.ok(await bcrypt.compare(oldPassword, f.user.password));
});

test("fresh website login works after revocation while the old password is rejected", async () => {
  const f = await fixture();
  await f.change({ logoutOtherSessions: true });
  const route = f.load("@/app/(main)/api/auth/login/route");
  const login = password => route.POST(new NextRequest("https://motionflow.test/api/auth/login", {
    method: "POST", body: JSON.stringify({ email: f.user.email, password }),
  }));
  assert.equal((await login(oldPassword)).status, 422);
  const response = await login(nextPassword);
  assert.equal(response.status, 200);
  assert.equal((await f.verifySessionToken(response.cookies.get(f.SESSION_COOKIE_NAME).value)).sessionVersion, 1);
});

test("verification fails closed when the version store is unavailable", async () => {
  const f = await fixture();
  f.failures.db = true;
  assert.equal(await f.verifySessionToken(f.token), null);
  assert.equal(await f.laravel.readLaravelSessionUserId(f.laravelId), null);
});

test("schema setup only creates the table when absent and retries failed initialization", async () => {
  let attempts = 0;
  let creates = 0;
  const failure = Object.assign(new Error("Connection refused"), { code: "ECONNREFUSED" });
  const pool = {
    async query(sql) {
      if (sql.startsWith("CREATE TABLE")) { creates++; return [[]]; }
      attempts++;
      if (attempts === 1) throw failure;
      if (attempts === 2) throw Object.assign(new Error("Missing table"), { code: "ER_NO_SUCH_TABLE" });
      return [[]];
    },
    async execute() { return [[]]; },
  };
  const versions = loader({ "@/lib/db": { getPool: () => pool } })("@/lib/auth/web-session-version");
  await assert.rejects(versions.ensureWebSessionSchema(), /Connection refused/);
  assert.equal(creates, 0);
  assert.equal(await versions.getWebSessionVersion(42), 0);
  assert.equal(creates, 1);
  assert.equal(await versions.getWebSessionVersion(99), 0);
  assert.equal(attempts, 2);
});
