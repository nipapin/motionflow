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
const { PackagesAuthorCreationError } = loader()("@/lib/packages-authors-db");
const request = body => new NextRequest("https://motionflow.test/api/packages/authors", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

function authorRoute({ email = "admin@example.test", create, buckets = async () => ["author-packs"] } = {}) {
  const writes = [];
  const load = loader({
    "@/lib/auth/get-session-user": { getSessionUser: async () => email ? { email } : null },
    "@/lib/packages-admin": { isPackagesAdmin: value => value === "admin@example.test" },
    "@/lib/packages-authors-db": { PackagesAuthorCreationError, createPackagesAuthorRow: async input => {
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

test("author creation validates selected IDs, names, generated slugs, bucket types and JSON", async () => {
  const { route, writes } = authorRoute();
  for (const invalid of [
    null, { id: 0 }, { id: -1 }, { id: 1.5 }, { id: 4294967296 }, { id: "9001" },
    { label: "  " }, { label: "x".repeat(256) }, { label: "!!!" },
    { label: "x".repeat(65) }, { r2_bucket: {} },
  ]) {
    const body = invalid === null ? null : { ...validAuthor, ...invalid };
    assert.equal((await route.POST(request(body))).status, 400, JSON.stringify(invalid));
  }
  assert.equal((await route.POST(request({}))).status, 400);
  const malformed = new NextRequest("https://motionflow.test/api/packages/authors", { method: "POST", body: "{" });
  assert.equal((await route.POST(malformed)).status, 400);
  assert.equal(writes.length, 0);
});

test("author creation derives slug on the server, trims fields and permits no bucket", async () => {
  const { route, writes } = authorRoute({ buckets: async () => { throw new Error("Should not need R2"); } });
  const response = await route.POST(request({ ...validAuthor, label: " New Author ", slug: "forged-slug", r2_bucket: " " }));
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

test("database creation reads the selected user's ID in the insert and uses parameters", async () => {
  const statements = [];
  const load = loader({
    "@/lib/db": { getPool: () => ({ query: async (sql, values) => {
      statements.push({ sql, values });
      if (sql.includes("WHERE id = ? OR slug = ?")) return [values[0] === validAuthor.id ? [] : [{ id: values[0], slug: values[1] }]];
      if (sql.includes("WHERE id = ? LIMIT 1")) return [[{ ...validAuthor, r2_prefix: "public/downloads/new-author/" }]];
      return [{ affectedRows: 1 }];
    } }) },
  });
  const author = await load("@/lib/packages-authors-db").createPackagesAuthorRow(validAuthor);
  const insert = statements.find(statement => statement.sql.includes("SELECT id, ?, ?, ?, ? FROM users WHERE id = ?"));
  assert.deepEqual(insert.values, ["new-author", "New Author", null, "public/downloads/new-author/", 9001]);
  assert.ok(!insert.sql.includes("ON DUPLICATE KEY UPDATE"));
  assert.equal(author.id, 9001);
});

test("database creation rejects missing users, existing author IDs and occupied slugs", async () => {
  for (const scenario of ["USER_NOT_FOUND", "AUTHOR_EXISTS", "SLUG_TAKEN"]) {
    let authorInserts = 0;
    const load = loader({ "@/lib/db": { getPool: () => ({ query: async (sql, values) => {
      if (sql.includes("WHERE id = ? OR slug = ?")) {
        if (values[0] !== validAuthor.id) return [[{ id: values[0], slug: values[1] }]];
        if (scenario === "AUTHOR_EXISTS") return [[{ id: validAuthor.id, slug: "other-name" }]];
        if (scenario === "SLUG_TAKEN") return [[{ id: 9002, slug: validAuthor.slug }]];
        return [[]];
      }
      if (sql.includes("SELECT id, ?, ?, ?, ? FROM users")) { authorInserts++; return [{ affectedRows: 0 }]; }
      return [{ affectedRows: 1 }];
    } }) } });
    await assert.rejects(load("@/lib/packages-authors-db").createPackagesAuthorRow(validAuthor), err => err.code === scenario);
    assert.equal(authorInserts, scenario === "USER_NOT_FOUND" ? 1 : 0);
  }
});

test("simultaneous author creation is protected by unique constraints", async () => {
  let inserted = false;
  const load = loader({ "@/lib/db": { getPool: () => ({ query: async (sql, values) => {
    if (sql.includes("WHERE id = ? OR slug = ?")) {
      if (values[0] !== validAuthor.id) return [[{ id: values[0], slug: values[1] }]];
      return [inserted ? [{ id: 9002, slug: validAuthor.slug }] : []];
    }
    if (sql.includes("SELECT id, ?, ?, ?, ? FROM users")) {
      inserted = true;
      throw Object.assign(new Error("Duplicate slug"), { code: "ER_DUP_ENTRY" });
    }
    return [{ affectedRows: 1 }];
  } }) } });
  await assert.rejects(load("@/lib/packages-authors-db").createPackagesAuthorRow(validAuthor), err => err.code === "SLUG_TAKEN");
});

test("author creation returns separate account and slug conflict messages", async () => {
  for (const code of ["USER_NOT_FOUND", "AUTHOR_EXISTS", "SLUG_TAKEN"]) {
    const { route } = authorRoute({ create: () => { throw new PackagesAuthorCreationError(code, `Message for ${code}`); } });
    const response = await route.POST(request(validAuthor));
    assert.equal(response.status, code === "USER_NOT_FOUND" ? 404 : 409);
    assert.deepEqual(await response.json(), { error: code, message: `Message for ${code}` });
  }
});

test("user search is admin-only, skips short queries and rejects oversized queries", async () => {
  let email = null;
  const queries = [];
  const load = loader({
    "@/lib/auth/get-session-user": { getSessionUser: async () => email ? { email } : null },
    "@/lib/packages-admin": { isPackagesAdmin: value => value === "admin@example.test" },
    "@/lib/packages-authors-db": { searchPackagesAuthorUsers: async q => { queries.push(q); return [{ id: 9001, email: "author@example.test", name: "Author", authorExists: false }]; } },
  });
  const route = load("@/app/(main)/api/packages/authors/users/route");
  const get = q => route.GET(new NextRequest(`https://motionflow.test/api/packages/authors/users?q=${encodeURIComponent(q)}`));
  assert.equal((await get("author")).status, 403);
  email = "member@example.test";
  assert.equal((await get("author")).status, 403);
  email = "admin@example.test";
  assert.deepEqual(await (await get("ab")).json(), { users: [] });
  assert.equal((await get("x".repeat(255))).status, 400);
  assert.equal((await get(" author@example.test ")).status, 200);
  assert.deepEqual(queries, ["author@example.test"]);
});

test("user search escapes email wildcards and identifies users who are already authors", async () => {
  let search;
  const load = loader({ "@/lib/db": { getPool: () => ({ query: async (sql, values) => {
    if (sql.includes("WHERE id = ? OR slug = ?")) return [[{ id: values[0], slug: values[1] }]];
    if (sql.includes("LEFT JOIN")) { search = { sql, values }; return [[{ id: 9001, name: "Author", email: "author@example.test", author_id: 9001 }]]; }
    return [{ affectedRows: 1 }];
  } }) } });
  const users = await load("@/lib/packages-authors-db").searchPackagesAuthorUsers("a_%");
  assert.deepEqual(search.values, ["%a\\_\\%%", "a_%"]);
  assert.ok(search.sql.includes("LIMIT 10"));
  assert.equal(users[0].authorExists, true);
});

test("slug generation follows Display Name and normalizes whitespace, punctuation and accents", () => {
  const { packagesAuthorSlug, newPackagesAuthorSchema } = loader()("@/lib/packages-author-input");
  assert.equal(packagesAuthorSlug("Display Name"), "display-name");
  assert.equal(packagesAuthorSlug("  Café & Motion  "), "cafe-motion");
  assert.equal(newPackagesAuthorSchema.parse({ id: 9001, label: "Display Name", slug: "ignored" }).slug, "display-name");
});

test("bucket creation validates names, checks conflicts, and sends CreateBucket to R2", async () => {
  let email = "admin@example.test";
  let names = ["existing-bucket"];
  let deny = false;
  const creates = [];
  const load = loader({
    "@/lib/auth/get-session-user": { getSessionUser: async () => email ? { email } : null },
    "@/lib/packages-admin": { isPackagesAdmin: value => value === "admin@example.test" },
    "@/lib/r2-storage": { getR2Client: () => ({ send: async command => {
      if (command.constructor.name === "ListBucketsCommand") return { Buckets: names.map(Name => ({ Name })) };
      if (deny) throw Object.assign(new Error("Denied"), { name: "AccessDenied" });
      creates.push(command.input); names = [...names, command.input.Bucket]; return {};
    } }) },
  });
  const route = load("@/app/(main)/api/packages/buckets/route");
  email = null;
  assert.equal((await route.POST(request({ name: "new-bucket" }))).status, 403);
  email = "member@example.test";
  assert.equal((await route.POST(request({ name: "new-bucket" }))).status, 403);
  email = "admin@example.test";
  for (const name of ["ab", "Uppercase", "bad_name", "bad.name", "-start", "end-", "x".repeat(64), 123]) {
    assert.equal((await route.POST(request({ name }))).status, 400);
  }
  assert.equal((await route.POST(request({ name: "existing-bucket" }))).status, 409);
  assert.deepEqual(creates, []);
  const response = await route.POST(request({ name: " new-bucket " }));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { bucket: "new-bucket" });
  assert.deepEqual(creates, [{ Bucket: "new-bucket" }]);
  deny = true;
  const denied = await route.POST(request({ name: "denied-bucket" }));
  assert.equal(denied.status, 502);
  assert.equal((await denied.json()).error, "ACCESS_DENIED");
});

function sidebar(pathname, props = {}) {
  const load = loader({ "next/navigation": { usePathname: () => pathname } });
  const { AccountSidebar } = load("@/components/account-sidebar");
  return renderToStaticMarkup(React.createElement(AccountSidebar, { access: 1, showPackages: true, showPartners: true, showUsers: true, ...props }));
}

test("admin menu opens the active group and keeps Dashboard as the last external link", () => {
  const html = sidebar("/profile/users");
  const buttons = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0]);
  const groupButton = label => buttons.find(button => new RegExp(`aria-label="(?:Collapse|Expand) ${label}"`).test(button));
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
  const authorList = html.match(/<ul aria-label="Authors menu".*?<\/ul>/s)?.[0];
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

test("PDF Links opens in the profile content with Tools expanded and current link highlighted", async () => {
  const html = sidebar("/profile/pdf-link");
  assert.match(html, /<a\b(?=[^>]*href="\/profile\/pdf-link")(?=[^>]*aria-current="page")[^>]*>/);
  const tools = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].find(match => match[0].includes('aria-label="Collapse Tools"'));
  assert.match(tools[0], /aria-expanded="true"/);
  const config = (await import("../next.config.mjs")).default;
  const legacy = (await config.redirects()).find(rule => rule.source.includes(":slug"));
  assert.equal(new RegExp(`^${legacy.source.replace(":slug", "")}$`).test("/profile/pdf-link"), false);
});

test("every group has its own overview link and collapse control including Authors", () => {
  for (const [group, route] of [["Account", "/profile/account"], ["Authors", "/profile/packages"], ["Management", "/profile/management"], ["Tools", "/profile/tools"]]) {
    const html = sidebar(route);
    assert.match(html, new RegExp(`aria-label="Collapse ${group}"[^>]*aria-expanded="true"`));
    assert.match(html, new RegExp(`<a\\b(?=[^>]*href="${route}")(?=[^>]*aria-current="page")[^>]*>`));
  }
});

test("PDF admin page checks authorization and the legacy URL redirects into the profile", async () => {
  let user = null;
  const load = loader({
    "@/lib/auth/get-session-user": { getSessionUser: async () => user },
    "@/lib/affiliate/admin": { isAffiliateAdmin: value => value.access === 100 },
    "@/components/pdf-link-page-client": { PdfLinkPageClient: () => React.createElement("div", null, "PDF uploader") },
    "next/navigation": { redirect: destination => { throw new Error(`redirect:${destination}`); } },
  });
  const page = load("@/app/(main)/(profile)/profile/pdf-link/page").default;
  await assert.rejects(page(), { message: "redirect:/" });
  user = { access: 0 };
  await assert.rejects(page(), { message: "redirect:/profile" });
  user = { access: 100 };
  const html = renderToStaticMarkup(await page());
  assert.ok(html.includes("PDF uploader"));
  assert.throws(() => load("@/app/(main)/(app)/pdf-link/page").default(), { message: "redirect:/profile/pdf-link" });
});
