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

test("every admin account page uses the same wide shell as authors and management", () => {
  const { profilePageClassForPath, PROFILE_PAGE_CLASS, PROFILE_PAGE_CLASS_WIDE } = loader()("@/lib/profile-layout");
  for (const route of ["/profile", "/profile/generations", "/profile/purchases", "/profile/subscriptions", "/profile/downloads", "/profile/favorites", "/profile/packages", "/profile/campaigns", "/profile/tools"]) {
    assert.equal(profilePageClassForPath(route, true), PROFILE_PAGE_CLASS_WIDE, route);
  }
  assert.equal(profilePageClassForPath("/profile", false), PROFILE_PAGE_CLASS);
});

test("section resolution follows child routes and treats Profile as an exact link", () => {
  const { profileNavigationGroupForPath, isProfileNavigationActive } = loader()("@/lib/profile-navigation");
  for (const [route, group] of [
    ["/profile/account", "account"], ["/profile/downloads/download-limit", "account"],
    ["/profile/packages/4141", "authors"], ["/profile/packages/authors/new", "authors"],
    ["/profile/extensions/4141", "authors"], ["/profile/management", "management"],
    ["/profile/users/9001", "management"], ["/profile/tools", "tools"], ["/profile/pdf-link", "tools"],
  ]) assert.equal(profileNavigationGroupForPath(route), group, route);
  assert.equal(isProfileNavigationActive("/profile/downloads", "/profile"), false);
});

test("account overview shows all account tiles and the optional affiliate tile", async () => {
  let signedIn = true;
  let showAffiliate = false;
  const load = loader({
    "@/lib/auth/get-session-user": { getSessionUser: async () => signedIn ? { id: 1 } : null },
    "@/lib/affiliate/nav": { affiliateNavFlags: async () => ({ showAffiliate }) },
    "next/navigation": { redirect: destination => { throw new Error(`redirect:${destination}`); } },
  });
  const page = load("@/app/(main)/(profile)/profile/account/page").default;
  const { ACCOUNT_NAVIGATION } = load("@/lib/profile-navigation");
  let html = renderToStaticMarkup(await page());
  for (const { href } of ACCOUNT_NAVIGATION) assert.ok(html.includes(`href="${href}"`), href);
  assert.ok(!html.includes('href="/profile/affiliate"'));
  showAffiliate = true;
  html = renderToStaticMarkup(await page());
  assert.ok(html.includes('href="/profile/affiliate"'));
  signedIn = false;
  await assert.rejects(page(), { message: "redirect:/" });
});

test("management and tools overviews only expose sections the user can access", async () => {
  let flags = { showPartners: false, showUsers: false };
  const load = loader({
    "@/lib/affiliate/nav": { affiliateNavFlags: async () => flags },
    "next/navigation": { redirect: destination => { throw new Error(`redirect:${destination}`); } },
  });
  const management = load("@/app/(main)/(profile)/profile/management/page").default;
  const tools = load("@/app/(main)/(profile)/profile/tools/page").default;
  await assert.rejects(management(), { message: "redirect:/profile" });
  await assert.rejects(tools(), { message: "redirect:/profile" });
  flags = { showPartners: true, showUsers: false };
  let html = renderToStaticMarkup(await management());
  assert.ok(html.includes('href="/profile/partners"'));
  assert.ok(!html.includes('href="/profile/users"'));
  flags = { showPartners: true, showUsers: true };
  html = renderToStaticMarkup(await management());
  for (const route of ["partners", "users", "campaigns"]) assert.ok(html.includes(`href="/profile/${route}"`));
  assert.ok(renderToStaticMarkup(await tools()).includes('href="/profile/pdf-link"'));
});

test("all section overview routes bypass the legacy profile redirect", async () => {
  const config = (await import("../next.config.mjs")).default;
  const legacy = (await config.redirects()).find(rule => rule.source.includes(":slug"));
  const match = new RegExp(`^${legacy.source.replace(":slug", "")}$`);
  for (const group of ["account", "management", "tools"]) assert.equal(match.test(`/profile/${group}`), false);
});
