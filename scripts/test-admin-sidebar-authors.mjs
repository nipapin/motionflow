import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);

// Run the real modules with isolated session, DB and R2 boundaries.
function loader(mocks = {}) {
  const cache = new Map();
  function load(specifier) {
    if (specifier === "server-only") return {};
    if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
    if (!specifier.startsWith("@/")) return require(specifier);
    if (cache.has(specifier)) return cache.get(specifier).exports;
    const base = path.join(root, specifier.slice(2));
    const filename = existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`;
    const source = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    const module = { exports: {} };
    cache.set(specifier, module);
    vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename })(load, module, module.exports);
    return module.exports;
  }
  return load;
}

const { NextRequest } = require("next/server");
const validAuthor = { id: 9001, label: "New Author", slug: "new-author", r2_bucket: null };
const request = body => new NextRequest("https://motionflow.test/api/packages/authors", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

function authorRoute({ email = "admin@example.test", create, buckets = async () => ["author-packs"] } = {}) {
  const writes = [];
  const load = loader({
    "@/lib/auth/get-session-user": { getSessionUser: async () => email ? { email } : null },
    "@/lib/packages-admin": { isPackagesAdmin: value => value === "admin@example.test" },
    "@/lib/packages-authors-db": { createPackagesAuthorRow: async input => {
      writes.push(input);
      return create ? create(input) : input;
    } },
    "@/lib/r2-storage": { getR2Client: () => ({ send: async () => ({ Buckets: (await buckets()).map(Name => ({ Name })) }) }) },
  });
  return { route: load("@/app/(main)/api/packages/authors/route"), writes };
}

test("author creation rejects unauthenticated and ordinary users before writing", async () => {
  for (const email of [null, "member@example.test"]) {
    const { route, writes } = authorRoute({ email });
    assert.equal((await route.POST(request(validAuthor))).status, 403);
    assert.equal(writes.length, 0);
  }
});

test("author creation validates IDs, names, slugs, bucket types and JSON", async () => {
  const { route, writes } = authorRoute();
  for (const invalid of [
    null, { id: 0 }, { id: -1 }, { id: 1.5 }, { id: 4294967296 }, { id: "9001" },
    { label: "  " }, { label: "x".repeat(256) }, { slug: "Uppercase" }, { slug: "a/b" },
    { slug: "a--b" }, { slug: "x".repeat(65) }, { r2_bucket: {} },
  ]) {
    const body = invalid === null ? null : { ...validAuthor, ...invalid };
    assert.equal((await route.POST(request(body))).status, 400, JSON.stringify(invalid));
  }
  assert.equal((await route.POST(request({}))).status, 400);
  const malformed = new NextRequest("https://motionflow.test/api/packages/authors", { method: "POST", body: "{" });
  assert.equal((await route.POST(malformed)).status, 400);
  assert.equal(writes.length, 0);
});

test("author creation allows no bucket, trims fields and returns the saved author", async () => {
  const { route, writes } = authorRoute({ buckets: async () => { throw new Error("Should not need R2"); } });
  const response = await route.POST(request({ ...validAuthor, label: " New Author ", slug: " new-author ", r2_bucket: " " }));
  assert.equal(response.status, 201);
  assert.deepEqual(writes, [validAuthor]);
  const { author } = await response.json();
  assert.equal(author.id, validAuthor.id);
  assert.equal(author.label, validAuthor.label);
  assert.equal(author.r2_bucket, null);
});

test("author creation verifies bucket availability and stores an available bucket", async () => {
  const { route, writes } = authorRoute();
  assert.equal((await route.POST(request({ ...validAuthor, r2_bucket: "bad bucket" }))).status, 400);
  assert.equal((await route.POST(request({ ...validAuthor, r2_bucket: "missing-bucket" }))).status, 400);
  assert.equal(writes.length, 0);
  const response = await route.POST(request({ ...validAuthor, r2_bucket: " author-packs " }));
  assert.equal(response.status, 201);
  assert.equal(writes[0].r2_bucket, "author-packs");
});

test("duplicate IDs and slugs return a useful conflict without updating an author", async () => {
  const { route } = authorRoute({ create: () => { throw Object.assign(new Error("Duplicate"), { code: "ER_DUP_ENTRY" }); } });
  const response = await route.POST(request(validAuthor));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "AUTHOR_EXISTS");
});

test("database creation inserts settings with parameters and preserves the supplied ID", async () => {
  const statements = [];
  const load = loader({
    "@/lib/db": { getPool: () => ({ query: async (sql, values) => {
      statements.push({ sql, values });
      if (sql.includes("WHERE id = ? OR slug = ?")) return [[{ id: values[0], slug: values[1] }]];
      if (sql.includes("WHERE id = ? LIMIT 1")) return [[{ ...validAuthor, r2_prefix: "public/downloads/new-author/" }]];
      return [{ affectedRows: 1 }];
    } }) },
  });
  const author = await load("@/lib/packages-authors-db").createPackagesAuthorRow(validAuthor);
  const insert = statements.find(statement => statement.values?.[0] === validAuthor.id && statement.sql.includes("INSERT"));
  assert.deepEqual(insert.values, [9001, "new-author", "New Author", null, "public/downloads/new-author/"]);
  assert.ok(!insert.sql.includes("ON DUPLICATE KEY UPDATE"));
  assert.equal(author.id, 9001);
});

function sidebar(pathname, props = {}) {
  const load = loader({ "next/navigation": { usePathname: () => pathname } });
  const { AccountSidebar } = load("@/components/account-sidebar");
  return renderToStaticMarkup(React.createElement(AccountSidebar, { access: 1, showPackages: true, showPartners: true, showUsers: true, ...props }));
}

test("admin menu opens the active group and keeps Dashboard as the last external link", () => {
  const html = sidebar("/profile/users");
  const buttons = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0]);
  const groupButton = label => buttons.find(button => button.replace(/<[^>]*>/g, "") === label);
  assert.match(groupButton("Account"), /aria-expanded="false"/);
  assert.match(groupButton("Management"), /aria-expanded="true"/);
  assert.match(groupButton("Tools"), /aria-expanded="false"/);
  for (const href of ["/profile/partners", "/profile/users", "/profile/campaigns"]) assert.ok(html.includes(`href="${href}"`));
  assert.match(html, /<a\b(?=[^>]*href="\/profile\/users")(?=[^>]*aria-current="page")[^>]*>/);
  assert.ok(!html.includes("Author area"));
  assert.match(html, /href="https:\/\/authors.motionflow.pro" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /lucide-external-link/);
  const links = [...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(match => match[1]);
  assert.equal(links.at(-1), "https://authors.motionflow.pro");
});

test("Add Author follows existing authors and the creation route is highlighted", () => {
  const html = sidebar("/profile/packages/authors/new");
  const authorList = html.match(/<ul id="account-sidebar-authors".*?<\/ul>/s)?.[0];
  assert.ok(authorList);
  const links = [...authorList.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
  assert.equal(links.at(-1), "/profile/packages/authors/new");
  assert.match(authorList, /<a\b(?=[^>]*href="\/profile\/packages\/authors\/new")(?=[^>]*aria-current="page")[^>]*>/);
});

test("ordinary account navigation stays visible without admin sections", () => {
  const html = sidebar("/profile", { access: 0, showPackages: false, showPartners: false, showUsers: false });
  for (const href of ["/profile", "/profile/generations", "/profile/purchases", "/profile/subscriptions", "/profile/downloads", "/profile/favorites"]) assert.ok(html.includes(`href="${href}"`));
  for (const label of ["Management", "Tools", "Add Author", "Dashboard"]) assert.ok(!html.includes(label));
});
