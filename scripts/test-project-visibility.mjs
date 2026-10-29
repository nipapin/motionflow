import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function loader(mocks = {}) {
  const cache = new Map();
  function load(name) {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === 'server-only') return {};
    if (!name.startsWith('@/')) return require(name);
    if (cache.has(name)) return cache.get(name);
    const source = readFileSync(new URL(`../${name.slice(2)}.ts`, import.meta.url), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    const exports = {}; cache.set(name, exports);
    vm.runInNewContext(code, { exports, require: load, process: { env: {} }, console, URL, URLSearchParams, Buffer });
    return exports;
  }
  return load;
}
const publicItem = { id: 1, author_id: 42, admin_only: 0, access: 1, files: '{}' };
const privateItem = { ...publicItem, id: 2, admin_only: 1 };
test('private projects allow only their uploader and administrators', () => {
  const { canViewMarketplaceItem: allowed } = loader()('@/lib/market-item-visibility');
  for (const viewer of [null, { id: 43, access: 2 }, { id: 43, access: 50 }]) {
    assert.equal(allowed(publicItem, viewer), true);
    assert.equal(allowed(privateItem, viewer), false);
  }
  assert.equal(allowed(privateItem, { id: '42', access: 2 }), true);
  assert.equal(allowed(privateItem, { id: 43, access: '100' }), true);
});
test('ID queries group author visibility and defend against unfiltered rows', async () => {
  const calls = [];
  const { getMarketItemsByIds } = loader({ '@/lib/db': { getMysqlPool: () => ({ query: async (sql, args) => {
    calls.push({ sql, args }); return [[publicItem, privateItem]];
  } }) }, '@/lib/product-ui': { softwareLabelToSlug: (s) => s } })('@/lib/market-items');
  assert.deepEqual(Array.from(await getMarketItemsByIds([2, 1]), p => p.id), [1]);
  assert.match(calls.at(-1).sql, /AND admin_only = 0/);
  assert.deepEqual(Array.from(await getMarketItemsByIds([2, 1], { id: 42, access: 2 }), p => p.id), [2, 1]);
  assert.match(calls.at(-1).sql, /AND \(admin_only = 0 OR author_id = \?\)/);
  assert.deepEqual(Array.from(calls.at(-1).args), [2, 1, 42]);
  assert.deepEqual(Array.from(await getMarketItemsByIds([2, 1], { id: 43, access: 50 }), p => p.id), [1]);
  assert.deepEqual(Array.from(await getMarketItemsByIds([2, 1], { id: 43, access: 100 }), p => p.id), [2, 1]);
});
test('fileless metadata survives parsing and preserves Paddle checkout configuration', async () => {
  const fileless = { ...publicItem, files: '{"no_file":true,"image":"cover"}', json_args: 'pri_test' };
  const { getMarketItemsByIds } = loader({ '@/lib/db': { getMysqlPool: () => ({ query: async () => [[fileless]] }) }, '@/lib/product-ui': {} })('@/lib/market-items');
  const [product] = await getMarketItemsByIds([1]);
  assert.equal(product.files.no_file, true);
  assert.equal(product.files.main, undefined);
  assert.equal(product.json_args, 'pri_test');
  const { normalizeProductFiles } = loader()('@/lib/product-ui');
  assert.equal(normalizeProductFiles(fileless.files).no_file, true);
});
function guardedRoutes(product) {
  let mutations = 0;
  const user = { id: 42, access: 2 };
  const forbidden = () => { mutations++; throw new Error('Must reject before any entitlement, rate, log, or download write'); };
  const load = loader({
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
    '@/lib/auth/resolve-request-user': { requestHasCepBearer: () => true, resolveRequestUser: async () => user },
    '@/lib/market-items': { getMarketItemsByIds: async (ids, viewer) => { assert.equal(viewer, user); return product ? [product] : []; } },
    '@/lib/db': { getPool: forbidden }, '@/lib/purchases': { userOwnsItem: forbidden },
    '@/lib/motionflow-urls': {}, '@/lib/motionflow-upstream-download': {}, '@/lib/marketplace-r2-presign': {},
    '@/lib/marketplace-download-rate-limit': { checkMarketplaceDownloadRateLimit: forbidden },
    '@/lib/product-ui': { productKind: forbidden }, '@/lib/subscriptions': { hasActiveMotionflowSubscription: forbidden },
    '@/lib/cep-entitlements': { getActiveAuthorSubscription: forbidden }, '@/lib/user-activity': { withDownloadActivity: forbidden },
  });
  return { load, mutations: () => mutations };
}
test('fileless products cannot download even when a user is signed in; no counters are charged', async () => {
  const { load, mutations } = guardedRoutes({ ...publicItem, files: { no_file: true } });
  const response = await load('@/app/(main)/api/download/[itemId]/route').GET({}, { params: Promise.resolve({ itemId: '1' }) });
  assert.equal(response.status, 404);
  assert.equal(response.body.error, 'NO_PROJECT_FILE');
  const access = await load('@/app/(main)/api/me/can-download/route').GET({ nextUrl: new URL('http://localhost/?itemId=1') });
  assert.equal(access.body.canDownload, false);
  assert.equal(mutations(), 0);
});
test('hidden or missing item never inherits download permission from a subscription', async () => {
  const { load, mutations } = guardedRoutes(null);
  const response = await load('@/app/(main)/api/me/can-download/route').GET({ nextUrl: new URL('http://localhost/?itemId=2') });
  assert.equal(response.body.canDownload, false);
  assert.equal(mutations(), 0);
});
