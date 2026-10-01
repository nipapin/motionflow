import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import vm from "node:vm";
import { Readable } from "node:stream";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);

// Execute the real TypeScript modules with isolated DB/R2/session boundaries.
// These tests never load .env or send requests to production services.
function loader(mocks = {}) {
  const cache = new Map();
  function load(specifier) {
    if (specifier === "server-only") return {};
    if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
    if (!specifier.startsWith("@/")) return require(specifier);
    if (cache.has(specifier)) return cache.get(specifier).exports;
    const filename = path.join(root, `${specifier.slice(2)}.ts`);
    const source = ts.transpileModule(readFileSync(filename, "utf8").replaceAll("import.meta.url", JSON.stringify(pathToFileURL(filename).href)), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const module = { exports: {} };
    cache.set(specifier, module);
    vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename })(load, module, module.exports);
    return module.exports;
  }
  return load;
}

const odin = loader()("@/lib/odin-packages");
const author = { id: odin.ODIN_PACKAGES_AUTHOR_ID, slug: "odin", label: "Premiere Basics — Odin Pro", r2Bucket: "odin-pro" };

test("pack diff streams a real ZIP with installed archiver 8", async () => {
  const load = loader({
    "@/lib/r2-storage": {
      getR2Client: () => ({ send: async command => command.input.Key.endsWith("manifest.json")
        ? { Body: { transformToString: async () => JSON.stringify([{ path: "asset.txt", hash: "new" }]) } }
        : { Body: Readable.from([Buffer.from("asset contents")]) } }),
    },
  });
  const result = await load("@/lib/packages-pack-diff").buildPackDiffZip({
    project: { downloadKey: "secure/test.zip" }, author, localManifest: [],
  });
  assert.equal(result.ok, true);
  const bytes = Buffer.from(await new Response(result.zipStream).arrayBuffer());
  assert.equal(bytes.subarray(0, 2).toString(), "PK");
  assert.ok(bytes.includes(Buffer.from("manifest.json")));
  assert.ok(bytes.includes(Buffer.from("asset.txt")));
  assert.deepEqual(result.toDownload, ["asset.txt"]);
});

test("Odin management proxy rejects non-admins and cross-origin writes; actor comes from session", async () => {
  let user = null;
  const forwarded = [];
  const load = loader({
    "@/lib/auth/get-session-user": { getSessionUser: async () => user },
    "@/lib/packages-admin": { isPackagesAdmin: email => email === "admin@example.test" },
    "@/lib/odin-management": { odinManagementRequest: async (query, body) => { forwarded.push({ query: query.toString(), body }); return { ok: true }; } },
  });
  const { NextRequest } = require("next/server");
  const route = load("@/app/(main)/api/odin/users/route");
  assert.equal((await route.GET(new NextRequest("https://motionflow.test/api/odin/users"))).status, 403);
  user = { email: "regular@example.test" };
  assert.equal((await route.GET(new NextRequest("https://motionflow.test/api/odin/users"))).status, 403);
  user = { email: "admin@example.test" };
  const post = origin => new NextRequest("https://motionflow.test/api/odin/users", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify({ user_id: "uuid", actor: "forged", action: "revoke", reason: "Support" }) });
  assert.equal((await route.POST(post("https://evil.test"))).status, 403);
  assert.equal(forwarded.length, 0);
  assert.equal((await route.POST(post("https://motionflow.test"))).status, 200);
  assert.equal(forwarded[0].body.actor, user.email);
});

test("managed catalog preserves legacy IDs, excludes hidden/admin packs, and isolates downloads", async () => {
  const saved = { map: process.env.ODIN_CATALOG_PACK_MAP, secret: process.env.ODIN_CATALOG_SECRET };
  process.env.ODIN_CATALOG_PACK_MAP = JSON.stringify({ 542: 7, 543: 8 });
  process.env.ODIN_CATALOG_SECRET = "x".repeat(32);
  let projects = [{ id: 7, name: "Odin", host: "PR", version: "1.2.0", downloadKey: "secure/pack.zip", admin_only: false }, { id: 8, host: "AE", version: "1.2.0", downloadKey: "secure/ae.zip", admin_only: true }];
  const load = loader({
    "@/lib/packages-projects": { listVisiblePackagesProjects: async id => { assert.equal(id, author.id); return projects; } },
    "@/lib/packages-admin": { getPackagesAuthorById: async () => author },
    "@/lib/packages-download": { getPackagesProjectDownloadUrl: async (project, selectedAuthor) => { assert.equal(selectedAuthor.r2Bucket, "odin-pro"); assert.equal(project.id, 7); return "https://packs.test/signed"; } },
  });
  try {
    const api = load("@/lib/odin-catalog");
    assert.equal(api.odinCatalogAuthorized(null), false);
    assert.equal(api.odinCatalogAuthorized("Bearer " + "x".repeat(32)), true);
    assert.deepEqual((await api.odinManagedPackages()).map(p => p.id), [542]);
    assert.equal(await api.odinManagedDownload(543), null);
    assert.equal((await api.odinManagedDownload(542)).url, "https://packs.test/signed");
    projects[0].downloadKey = "public/pack.zip";
    await assert.rejects(api.odinManagedDownload(542), /PRIVATE_ODIN_BUCKET_REQUIRED/);
    projects = [{ ...projects[0], downloadKey: "secure/pack.zip" }, { ...projects[0], id: 8 }];
    await assert.rejects(api.odinManagedPackages(), /AMBIGUOUS_ODIN_PACKS/);
    process.env.ODIN_CATALOG_PACK_MAP = JSON.stringify({ 542: 7, 543: 7 });
    await assert.rejects(api.odinManagedPackages(), /INVALID_PACK_MAP/);
    const route = load("@/app/(main)/api/integrations/odin/catalog/route");
    const { NextRequest } = require("next/server");
    assert.equal((await route.GET(new NextRequest("https://motionflow.test/api/integrations/odin/catalog"))).status, 401);
  } finally {
    for (const [key, value] of [["ODIN_CATALOG_PACK_MAP", saved.map], ["ODIN_CATALOG_SECRET", saved.secret]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("Odin seed configures its bucket once and preserves existing author settings", async () => {
  const queries = [];
  const load = loader({ "@/lib/db": { getPool: () => ({ query: async (sql, values) => {
    queries.push({ sql, values });
    return sql.startsWith("SELECT id, slug") ? [[author]] : [{ affectedRows: 1 }];
  } }) } });
  const db = load("@/lib/packages-authors-db");
  await db.seedPackagesAuthors();
  await db.seedPackagesAuthors();
  const inserts = queries.filter(q => q.sql.startsWith("INSERT") && q.values[1] === "odin");
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].values[3], "odin-pro");
  assert.match(inserts[0].sql, /ON DUPLICATE KEY UPDATE id = id/);
  assert.ok(queries.every(q => !/marketplace_items|INSERT INTO `users`/.test(q.sql)));
});

test("conflicting Odin registry IDs fail without renaming existing authors", async () => {
  const load = loader({ "@/lib/db": { getPool: () => ({ query: async sql =>
    sql.startsWith("SELECT id, slug") ? [[{ id: author.id, slug: "someone-else" }]] : [{}],
  }) } });
  await assert.rejects(load("@/lib/packages-authors-db").seedPackagesAuthors(), /conflicts/);
});

test("authors endpoint requires admin; admins receive Odin with its own logo", async () => {
  let user = null;
  const load = loader({
    "@/lib/auth/get-session-user": { getSessionUser: async () => user },
    "@/lib/packages-admin": { isPackagesAdmin: email => email === "admin@example.test", listPackagesAuthors: async () => [author] },
  });
  const route = load("@/app/(main)/api/packages/authors/route");
  assert.equal((await route.GET()).status, 403);
  user = { email: "regular@example.test" };
  assert.equal((await route.GET()).status, 403);
  user = { email: "admin@example.test" };
  const body = await (await route.GET()).json();
  assert.equal(body.authors[0].r2_bucket, "odin-pro");
  assert.equal(body.authors[0].logoUrl, "/assets/odin.webp");
});

test("Odin zip upload uses author bucket and existing secure package layout", async () => {
  const writes = [];
  const load = loader({
    "@/lib/auth/get-session-user": { getSessionUser: async () => ({ email: "admin@example.test" }) },
    "@/lib/packages-admin": { isPackagesAdmin: () => true, getPackagesAuthorById: async () => author },
    "@/lib/db": {},
    "@/lib/packages-authors-db": {},
    "@/lib/cep-events": {},
    "@/lib/r2-storage": {
      getR2Client: () => ({ send: async command => { writes.push(command.input); } }),
    },
  });
  const projects = load("@/lib/packages-projects");
  projects.getPackagesProject = async () => ({ id: 7, author_id: author.id });
  projects.updatePackagesProject = async (_authorId, _itemId, patch) => patch;
  const form = new FormData();
  form.set("kind", "zip");
  form.set("file", new File(["PK test fixture"], "Odin Pack.zip", { type: "application/zip" }));
  const route = load("@/app/(main)/api/packages/[authorId]/projects/[itemId]/upload/route");
  const response = await route.POST(new Request("http://localhost/upload", { method: "POST", body: form }), {
    params: Promise.resolve({ authorId: String(author.id), itemId: "7" }),
  });
  assert.equal(response.status, 200);
  assert.equal(writes[0].Bucket, "odin-pro");
  assert.equal(writes[0].Key, `secure/packages/${author.id}/7/Odin_Pack.zip`);
  assert.equal((await response.json()).project.downloadKey, writes[0].Key);
});

test("Odin JSON is loaded from manifests; legacy binary and null are rejected", async () => {
  let pack = "";
  const load = loader({
    "@/lib/r2-storage": {
      getR2Client: () => ({ send: async command => {
        assert.equal(command.input.Bucket, "odin-pro");
        return { Body: { transformToString: async () => command.input.Key.endsWith("manifest.json")
          ? JSON.stringify([{ path: "Odin.ODIN", hash: "abc" }]) : pack } };
      } }),
    },
  });
  const { loadPackStructureFromR2 } = load("@/lib/packages-pack-structure");
  for (const contentKey of ["content", "contents", "structure"]) {
    pack = "\uFEFF" + JSON.stringify({ settings: { main: { version: "2.0.0" } }, [contentKey]: { folder: [] } });
    const result = await loadPackStructureFromR2({ author, project: { id: 7, name: "Odin", downloadKey: "packs/odin.zip" } });
    assert.equal(result.ok, true);
    assert.equal(result.version, "2.0.0");
    assert.deepEqual(result.content, { folder: [] });
  }
  for (const invalid of ["BIN_AX\u0000not-json", "null", "[]"]) {
    pack = invalid;
    assert.equal((await loadPackStructureFromR2({ author, project: { downloadKey: "packs/odin.zip" } })).ok, false);
  }
  pack = JSON.stringify({ settings: { main: { version: "DEMO" }, contents: { Transitions: {} } } });
  const demo = await loadPackStructureFromR2({ author, project: { id: 7, name: "Odin", downloadKey: "odin-pro-pr-free.zip" } });
  assert.equal(demo.ok, true);
  assert.equal(demo.version, "DEMO");
  assert.deepEqual(demo.content, { Transitions: {} });
});

test("registering Odin does not expose its bucket through public showcases", async () => {
  const load = loader({
    "@/lib/packages-authors-db": { listPackagesAuthorRows: async () => [
      { ...author, r2_bucket: "odin-pro" },
      { id: 1691, slug: "spunkram", r2_bucket: "spunkram-packs" },
    ] },
    "@/lib/r2-storage": { getR2Bucket: () => "motionflow-public" },
  });
  const { resolveShowcaseLocation } = load("@/lib/spunkram-showcase-catalog");
  assert.equal(await resolveShowcaseLocation("s3://odin-pro/pack/Previews/"), null);
  assert.equal((await resolveShowcaseLocation("s3://spunkram-packs/pack/Previews/")).bucket, "spunkram-packs");
});

test("saving an Odin package cannot link it to a public Motionflow marketplace item", async () => {
  const updates = [];
  const load = loader({
    "@/lib/packages-admin": { getPackagesAuthorById: async () => author },
    "@/lib/packages-authors-db": { ensurePackagesProjectsTable: async () => {}, packagesProjectsTableName: () => "packages_projects" },
    "@/lib/cep-events": {},
    "@/lib/db": { getPool: () => ({ query: async (sql, values) => {
      if (sql.startsWith("UPDATE")) { updates.push(values); return [{}]; }
      return [[{ id: 7, author_id: author.id, name: "Odin", host: "PR", visible: 0, deleted_at: null }]];
    } }) },
  });
  await load("@/lib/packages-projects").updatePackagesProject(author.id, 7, {
    marketplace_item_id: 1138, details_url: "https://odin-pro.com/packages/1138",
  });
  assert.equal(updates.length, 1);
  assert.equal(updates[0][6], null);
  assert.equal(updates[0][5], "https://odin-pro.com/packages/1138");
});
