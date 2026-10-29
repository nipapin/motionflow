import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(file, mocks) {
  const code = ts.transpileModule(readFileSync(new URL('../lib/' + file + '.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, process: { env: {} }, console, Buffer,
    require: name => name === 'server-only' ? {} : Object.hasOwn(mocks, name) ? mocks[name] : name.startsWith('@/') ? {} : require(name),
  }, { filename: file + '.ts' });
  return module.exports;
}

function fixture({ status = 1, credit = 'txn_paid', balance = 100 } = {}) {
  const state = { status, credit, balance, earn: 8.25, refundCalls: 0 };
  const execute = async (sql, params) => {
    sql = sql.replaceAll('`', '');
    if (/UPDATE subscription_systems\s+SET status\s*= -1/.test(sql)) { state.status = -1; return [{ affectedRows: 1 }]; }
    if (/SELECT buyer_id,/.test(sql)) return [[]]; // No scheduled replacement purchase.
    if (/SELECT id, author_id, author_earn/.test(sql)) {
      assert.match(sql, /FOR UPDATE/);
      const eligible = sql.includes('status IN (1, -1)') ? [1, -1].includes(state.status) : state.status === 1;
      return [eligible && params[0] === 'txn_paid' ? [{ id: 1, author_id: 4141, author_earn: state.earn, author_balance_credited_for_payment_id: state.credit }] : []];
    }
    if (/UPDATE users SET balance = balance -/.test(sql)) {
      assert.equal(params[1], 4141); state.balance -= params[0]; return [{ affectedRows: 1 }];
    }
    if (/UPDATE subscription_systems\s+SET author_earn = 0/.test(sql)) {
      state.earn = 0; state.credit = null; state.status = 0; return [{ affectedRows: 1 }];
    }
    throw new Error('Unexpected fixture database operation: ' + sql);
  };
  const connection = { execute, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
  const db = { getPool: () => ({ execute, getConnection: async () => connection }) };
  const port = load('paddle-laravel-port', { '@/lib/db': db });
  const server = load('paddle-server', {
    '@/lib/db': db,
    '@/lib/paddle-actual': { actualAdjustment: async () => ({ handled: false }), isActualSubscription: async () => false },
    '@/lib/paddle-laravel-port': { ...port, lookupSubscriptionForGhl: async () => null,
      handleAdjustmentRefund: async () => { state.refundCalls++; return { ok: true, reason: 'not_direct_sale' }; },
      // A regression sentinel: the old event router called this and erased paid income.
      reverseAuthorBalanceForSubscriptionTermination: async () => { state.balance -= state.earn; state.credit = null; },
    },
    '@/lib/affiliate/commission': { reverseAffiliateCommissionsForPayment: async () => 0 },
  });
  return { state, event: (event_type, data) => server.handlePaddleEvent({ event_type, data }) };
}

for (const type of ['subscription.canceled', 'subscription.past_due', 'subscription.paused']) {
  test(type + ': stop access/renewal without reversing the last successful payment', async () => {
    const f = fixture();
    await f.event(type, { id: 'sub_paid' });
    await f.event(type, { id: 'sub_paid' });
    assert.equal(f.state.status, -1);
    assert.equal(f.state.balance, 100);
    assert.equal(f.state.credit, 'txn_paid');
    assert.equal(f.state.earn, 8.25);
  });
}

const refund = (overrides = {}) => ({ transaction_id: 'txn_paid', action: 'refund', status: 'approved', type: 'full',
  items: [{ item_id: 'txnitm_paid' }], ...overrides });
test('an approved refund after cancellation removes its credit exactly once', async () => {
  const f = fixture();
  await f.event('subscription.canceled', { id: 'sub_paid' });
  await f.event('adjustment.updated', refund());
  await f.event('adjustment.updated', refund());
  assert.equal(f.state.balance, 91.75);
  assert.equal(f.state.credit, null);
  assert.equal(f.state.status, 0);
});
for (const adjustment of [{ status: 'pending_approval' }, { status: 'rejected' }, { action: 'credit' }]) {
  test('non-final/non-refund adjustment leaves the credited money alone: ' + JSON.stringify(adjustment), async () => {
    const f = fixture(); await f.event('adjustment.updated', refund(adjustment));
    assert.equal(f.state.balance, 100);
    assert.equal(f.state.credit, 'txn_paid');
    assert.equal(f.state.refundCalls, 0);
  });
}
test('old reversed cancellations are not restored and cannot be debited twice', async () => {
  const f = fixture({ status: -1, credit: null, balance: 91.75 });
  await f.event('subscription.canceled', { id: 'sub_paid' });
  await f.event('adjustment.updated', refund());
  assert.equal(f.state.balance, 91.75);
});
