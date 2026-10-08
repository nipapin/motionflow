import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planBilling, applyBilling, previewBilling, createPaddleClient } from './lib/premieregal-course-billing.mjs';
import { PREMIERE_GAL_PRICE_IDS } from '../lib/premiere-gal-paddle-config.ts';

const now = new Date('2026-10-08T10:00:00Z');
const row = { id: 10, buyer_id: 7, subscription_id: `sub_${'a'.repeat(26)}`, paddle_price_id: PREMIERE_GAL_PRICE_IDS.yearly };
const grant = { campaign: 'course', user_id: 7, subscription_id: 'admin_course_bonus' };
const subscription = () => ({
  id: row.subscription_id, customer_id: 'ctm_example', collection_mode: 'automatic', status: 'active',
  custom_data: { buyer_id: 7 }, scheduled_change: null,
  next_billed_at: '2027-02-01T09:15:00Z',
  current_billing_period: { starts_at: '2026-02-01T09:15:00Z', ends_at: '2027-02-01T09:15:00Z' },
  billing_cycle: { interval: 'year', frequency: 1 },
  items: [{ recurring: true, status: 'active', quantity: 1, price: { id: row.paddle_price_id, billing_cycle: { interval: 'year', frequency: 1 } } }],
});

test('billing target is current Paddle period end plus one calendar year, not today or local bonus expiry', () => {
  const plan = planBilling(row, subscription(), null, 'sandbox', now);
  assert.equal(plan.previousNextBilledAt, '2027-02-01T09:15:00Z');
  assert.equal(plan.targetNextBilledAt, '2028-02-01T09:15:00.000Z');
  const leap = subscription();
  leap.next_billed_at = leap.current_billing_period.ends_at = '2028-02-29T09:15:00Z';
  assert.equal(planBilling(row, leap, null, 'sandbox', now).targetNextBilledAt, '2029-02-28T09:15:00.000Z');
});

test('past due, scheduled cancellation, near renewal, mixed products and buyer mismatch require review', () => {
  const past = subscription(); past.status = 'past_due';
  assert.throws(() => planBilling(row, past, null, 'sandbox', now), /past_due/);
  const scheduled = subscription(); scheduled.scheduled_change = { action: 'cancel' };
  assert.throws(() => planBilling(row, scheduled, null, 'sandbox', now), /scheduled/);
  const near = subscription(); near.next_billed_at = near.current_billing_period.ends_at = '2026-10-08T10:29:00Z';
  assert.throws(() => planBilling(row, near, null, 'sandbox', now), /30 minutes/);
  const mixed = subscription(); mixed.items.push({ recurring: true, price: { id: 'pri_other', billing_cycle: { interval: 'month' } } });
  assert.throws(() => planBilling(row, mixed, null, 'sandbox', now), /mixed/);
  const other = subscription(); other.custom_data.buyer_id = 8;
  assert.throws(() => planBilling(row, other, null, 'sandbox', now), /different buyer/);
});

test('canceled and paused subscriptions are not restarted; trialing renewal can be extended', () => {
  for (const status of ['canceled', 'paused']) {
    const live = subscription(); live.status = status; live.next_billed_at = null;
    assert.equal(planBilling(row, live, null, 'sandbox', now).action, 'no_renewal');
  }
  const trial = subscription(); trial.status = 'trialing';
  assert.equal(planBilling(row, trial, null, 'sandbox', now).action, 'move_billing');
});

function fixture() {
  let live = subscription();
  const journal = [];
  const events = [];
  const calls = [];
  let failSync = false, loseResponse = false, patches = 0;
  const conn = {
    beginTransaction: async () => events.push('begin'),
    commit: async () => events.push('commit'), rollback: async () => events.push('rollback'),
    execute: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('SELECT id, buyer_id')) return [[row]];
      if (sql.includes('SELECT * FROM premieregal_course_billing')) return [[...journal]];
      if (sql.includes('INSERT INTO premieregal_course_billing')) {
        assert.ok(!events.includes('begin'));
        journal.push({ campaign: params[0], subscription_id: params[1], buyer_id: params[2], environment: params[3], status: 'prepared',
          previous_next_billed_at: params[4], target_next_billed_at: params[5], snapshot: JSON.parse(params[6]) });
      }
      if (sql.includes('SELECT id FROM subscription_systems')) return [[{ id: 10 }]];
      if (sql.includes('UPDATE subscription_systems') && failSync) throw new Error('SQL sync failed');
      if (sql.includes("SET status = 'applied'")) journal[0].status = 'applied';
      return [{ affectedRows: 1 }];
    },
  };
  const client = {
    getSubscription: async () => structuredClone(live),
    moveBillingDate: async (id, target) => {
      patches++;
      assert.equal(journal[0]?.status, 'prepared');
      assert.ok(!events.includes('begin')); // No DB locks held across the HTTP request.
      assert.equal(id, row.subscription_id);
      live.next_billed_at = target; live.current_billing_period.ends_at = target;
      if (loseResponse) throw new Error('Paddle response lost');
      return structuredClone(live);
    },
  };
  return { conn, client, calls, journal, events, get live() { return live; }, get patches() { return patches; },
    set failSync(value) { failSync = value; }, set loseResponse(value) { loseResponse = value; } };
}

test('billing preview only reads DB/Paddle and never moves a date or writes a journal', async () => {
  const f = fixture();
  const plans = await previewBilling(f.conn, [grant], f.client, 'sandbox', now);
  assert.equal(plans[0].targetNextBilledAt, '2028-02-01T09:15:00.000Z');
  assert.equal(f.patches, 0);
  assert.equal(f.journal.length, 0);
  assert.ok(f.calls.every(c => c.sql.trim().startsWith('SELECT')));
});

test('absolute target is saved before PATCH; confirmed Paddle period is synchronized locally', async () => {
  const f = fixture();
  const plan = (await previewBilling(f.conn, [grant], f.client, 'sandbox', now))[0];
  const result = await applyBilling(f.conn, grant, plan, 'sandbox', f.client, now);
  assert.equal(result.action, 'moved');
  assert.equal(f.patches, 1);
  assert.equal(f.journal[0].status, 'applied');
  assert.deepEqual(f.events, ['begin', 'commit']);
  const sync = f.calls.find(c => c.sql.includes('paddle_billing_period_starts_at'));
  assert.equal(sync.params[3], '2028-02-01 09:15:00');
  assert.ok(f.calls.some(c => c.sql.includes('UPDATE premieregal_course_grants')));
  const repeat = (await previewBilling(f.conn, [grant], f.client, 'sandbox', now))[0];
  assert.equal(repeat.action, 'already_moved');
  await applyBilling(f.conn, grant, repeat, 'sandbox', f.client, now);
  assert.equal(f.patches, 1);
});

test('lost Paddle response reconciles from GET without extending another year', async () => {
  const f = fixture(); f.loseResponse = true;
  const plan = (await previewBilling(f.conn, [grant], f.client, 'sandbox', now))[0];
  await assert.rejects(applyBilling(f.conn, grant, plan, 'sandbox', f.client, now), /response lost/);
  assert.equal(f.journal[0].status, 'prepared');
  const retry = (await previewBilling(f.conn, [grant], f.client, 'sandbox', now))[0];
  assert.equal(retry.action, 'reconcile');
  await applyBilling(f.conn, grant, retry, 'sandbox', f.client, now);
  assert.equal(f.patches, 1);
  assert.equal(f.journal[0].status, 'applied');
});

test('DB failure after Paddle change rolls back SQL and retry syncs the original target', async () => {
  const f = fixture(); f.failSync = true;
  const plan = (await previewBilling(f.conn, [grant], f.client, 'sandbox', now))[0];
  await assert.rejects(applyBilling(f.conn, grant, plan, 'sandbox', f.client, now), /SQL sync failed/);
  assert.equal(f.journal[0].status, 'prepared');
  assert.deepEqual(f.events, ['begin', 'rollback']);
  f.failSync = false;
  const retry = (await previewBilling(f.conn, [grant], f.client, 'sandbox', now))[0];
  await applyBilling(f.conn, grant, retry, 'sandbox', f.client, now);
  assert.equal(f.patches, 1);
  assert.equal(f.journal[0].target_next_billed_at, '2028-02-01T09:15:00.000Z');
});

test('changed dates, items and environment block a prepared billing operation', async () => {
  const f = fixture(); f.loseResponse = true;
  const plan = (await previewBilling(f.conn, [grant], f.client, 'sandbox', now))[0];
  await assert.rejects(applyBilling(f.conn, grant, plan, 'sandbox', f.client, now));
  assert.throws(() => planBilling(row, f.live, f.journal[0], 'production', now), /environment/);
  const shifted = structuredClone(f.live);
  shifted.next_billed_at = shifted.current_billing_period.ends_at = '2029-02-01T09:15:00Z';
  assert.throws(() => planBilling(row, shifted, f.journal[0], 'sandbox', now), /unexpected date/);
  const changed = structuredClone(f.live); changed.items[0].quantity = 2;
  assert.throws(() => planBilling(row, changed, f.journal[0], 'sandbox', now), /changed since/);
});

test('manual shortening after completion is detected without adding another year', async () => {
  const f = fixture();
  const plan = (await previewBilling(f.conn, [grant], f.client, 'sandbox', now))[0];
  await applyBilling(f.conn, grant, plan, 'sandbox', f.client, now);
  const shortened = subscription();
  assert.throws(() => planBilling(row, shortened, f.journal[0], 'sandbox', now), /shortened afterwards/);
  assert.equal(f.patches, 1);
});

test('Paddle PATCH sends do_not_bill and fixed date, preserving price, quantity and billing cycle', async () => {
  const priorEnvironment = process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT;
  const priorKey = process.env.PADDLE_API_KEY;
  process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT = 'sandbox'; process.env.PADDLE_API_KEY = 'test-only';
  try {
    const requests = [];
    const client = createPaddleClient(async (url, init) => {
      requests.push({ url, init }); return { ok: true, status: 200, json: async () => ({ data: subscription() }) };
    });
    await client.getSubscription(row.subscription_id);
    await client.moveBillingDate(row.subscription_id, '2028-02-01T09:15:00Z');
    assert.equal(requests[0].init.method, 'GET');
    assert.equal(requests[1].url, `https://sandbox-api.paddle.com/subscriptions/${row.subscription_id}`);
    assert.equal(requests[1].init.method, 'PATCH');
    assert.deepEqual(JSON.parse(requests[1].init.body), { next_billed_at: '2028-02-01T09:15:00Z', proration_billing_mode: 'do_not_bill' });
  } finally {
    if (priorEnvironment === undefined) delete process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT; else process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT = priorEnvironment;
    if (priorKey === undefined) delete process.env.PADDLE_API_KEY; else process.env.PADDLE_API_KEY = priorKey;
  }
});
