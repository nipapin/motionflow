import { createHash } from 'node:crypto';
import { PREMIERE_GAL_AUTHOR_ID, PREMIERE_GAL_PRICE_IDS } from '../../lib/premiere-gal-paddle-config.ts';
import { CAMPAIGN_TABLE, addYear, asDate, sqlDate } from './premieregal-course.mjs';

export const BILLING_TABLE = 'premieregal_course_billing';
const decode = value => typeof value === 'string' ? JSON.parse(value) : value;
const sameDate = (a, b) => Boolean(a && b) && asDate(a).getTime() === asDate(b).getTime();

export function billingEnvironment() {
  const environment = process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT?.toLowerCase();
  if (!['sandbox', 'production'].includes(environment)) throw new Error('Set NEXT_PUBLIC_PADDLE_ENVIRONMENT explicitly to sandbox or production');
  return environment;
}

// Standalone CLI counterpart of lib/paddle-api.ts (which imports Next's server-only guard).
export function createPaddleClient(fetchImpl = globalThis.fetch) {
  async function request(id, body) {
    if (!/^sub_[a-z0-9]{26}$/.test(id)) throw new Error('Invalid Paddle subscription id');
    const environment = billingEnvironment();
    const key = process.env.PADDLE_API_KEY?.trim();
    if (!key) throw new Error('Missing PADDLE_API_KEY');
    const base = environment === 'production' ? 'https://api.paddle.com' : 'https://sandbox-api.paddle.com';
    const response = await fetchImpl(`${base}/subscriptions/${id}`, {
      method: body ? 'PATCH' : 'GET', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000),
    });
    const json = await response.json();
    if (!response.ok || !json.data) throw new Error(`Paddle ${response.status}: ${json.error?.code || 'invalid_response'}`);
    return json.data;
  }
  return { getSubscription: id => request(id), moveBillingDate: (id, target) => {
    if (!Number.isFinite(Date.parse(target))) throw new Error('Invalid Paddle billing date');
    return request(id, { next_billed_at: target, proration_billing_mode: 'do_not_bill' });
  } };
}

export const paddleClient = createPaddleClient();

function fingerprint(sub) {
  return createHash('sha256').update(JSON.stringify({
    customer: sub.customer_id, collection: sub.collection_mode, cycle: sub.billing_cycle,
    items: (sub.items || []).map(item => ({ price: item.price?.id, quantity: item.quantity,
      recurring: item.recurring, status: item.status })).sort((a, b) => String(a.price).localeCompare(String(b.price))),
  })).digest('hex');
}

function verifyIdentity(row, sub) {
  if (row.subscription_id !== sub?.id) throw new Error('Paddle returned a different subscription');
  const buyer = sub.custom_data?.buyer_id ?? sub.custom_data?.userId;
  if (buyer != null && Number(buyer) !== Number(row.buyer_id)) throw new Error('Paddle subscription belongs to a different buyer');
  const recurring = (sub.items || []).filter(item => item.recurring !== false && item.price?.billing_cycle);
  if (!recurring.length || recurring.some(item => ![
    row.paddle_price_id, PREMIERE_GAL_PRICE_IDS.monthly, PREMIERE_GAL_PRICE_IDS.yearly,
  ].filter(Boolean).includes(item.price?.id))) throw new Error('Unexpected or mixed Paddle subscription items; review manually');
}

function verifyRenewing(sub, now) {
  if (!['active', 'trialing'].includes(sub.status)) throw new Error(`Paddle status ${sub.status} cannot be moved automatically; review manually`);
  if (sub.scheduled_change) throw new Error('Paddle has a scheduled cancel/pause/change; review manually');
  if (!sub.next_billed_at || !sub.current_billing_period?.ends_at || !sub.current_billing_period?.starts_at) {
    throw new Error('Paddle billing period or next billing date is missing');
  }
  if (!sameDate(sub.next_billed_at, sub.current_billing_period.ends_at)) throw new Error('Paddle renewal differs from period end; review manually');
  if (asDate(sub.next_billed_at).getTime() - now.getTime() <= 30 * 60 * 1000) throw new Error('Paddle renewal is within 30 minutes; review manually');
}

export function planBilling(row, sub, saved, environment, now = new Date()) {
  verifyIdentity(row, sub);
  if (saved && (saved.environment !== environment || Number(saved.buyer_id) !== Number(row.buyer_id))) {
    throw new Error('Billing environment or buyer differs from saved operation');
  }
  if (saved?.status === 'applied') {
    if (['active', 'trialing'].includes(sub.status) &&
        (!sub.next_billed_at || asDate(sub.next_billed_at) < asDate(saved.target_next_billed_at))) {
      throw new Error('Completed Paddle billing date was shortened afterwards; review manually');
    }
    return { subscriptionId: sub.id, userId: Number(row.buyer_id), action: 'already_moved', saved, row, live: sub,
      previousNextBilledAt: saved.previous_next_billed_at, targetNextBilledAt: saved.target_next_billed_at };
  }
  if (!saved && ['canceled', 'paused'].includes(sub.status)) {
    return { subscriptionId: sub.id, userId: Number(row.buyer_id), action: 'no_renewal', paddleStatus: sub.status, row, live: sub };
  }
  verifyRenewing(sub, now);
  const snapshot = { fingerprint: fingerprint(sub), periodStart: sub.current_billing_period.starts_at,
    periodEnd: sub.current_billing_period.ends_at, status: sub.status };
  if (saved) {
    if (saved.status !== 'prepared') throw new Error('Unknown saved billing status');
    const original = decode(saved.snapshot);
    if (snapshot.fingerprint !== original.fingerprint || snapshot.status !== original.status ||
        !sameDate(snapshot.periodStart, original.periodStart)) throw new Error('Paddle subscription changed since preparation; review manually');
    if (sameDate(sub.next_billed_at, saved.target_next_billed_at)) {
      return { subscriptionId: sub.id, userId: Number(row.buyer_id), action: 'reconcile', saved, row, live: sub,
        previousNextBilledAt: saved.previous_next_billed_at, targetNextBilledAt: saved.target_next_billed_at };
    }
    if (!sameDate(sub.next_billed_at, saved.previous_next_billed_at) || !sameDate(snapshot.periodEnd, original.periodEnd)) {
      throw new Error('Paddle billing date changed to an unexpected date; review manually');
    }
  }
  return { subscriptionId: sub.id, userId: Number(row.buyer_id), action: 'move_billing', saved, snapshot, row, live: sub,
    previousNextBilledAt: saved?.previous_next_billed_at || sub.next_billed_at,
    targetNextBilledAt: saved?.target_next_billed_at || addYear(asDate(sub.current_billing_period.ends_at)).toISOString() };
}

export async function previewBilling(conn, grants, client = paddleClient, environment, now = new Date()) {
  const plans = [];
  for (const grant of grants) {
    const [rows] = await conn.execute(
      `SELECT id, buyer_id, subscription_id, paddle_price_id FROM subscription_systems
       WHERE buyer_id = ? AND author_id = ? AND \`system\` = 'paddle'
       AND (subscription_id LIKE 'sub_%' OR (status IN (1, -1) AND COALESCE(plan, '') <> 'lifetime'))`,
      [grant.user_id, PREMIERE_GAL_AUTHOR_ID],
    );
    const [savedRows] = await conn.execute(`SELECT * FROM ${BILLING_TABLE} WHERE campaign = ? AND buyer_id = ?`, [grant.campaign, grant.user_id]);
    if (savedRows.some(saved => !rows.some(row => row.subscription_id === saved.subscription_id))) throw new Error('Saved Paddle subscription missing from local account; review manually');
    const unique = new Map(rows.map(row => [row.subscription_id, row]));
    for (const row of unique.values()) {
      if (!/^sub_[a-z0-9]{26}$/.test(row.subscription_id)) throw new Error('Legacy or missing Paddle Billing subscription id; review manually');
      environment ||= billingEnvironment();
      const live = await client.getSubscription(row.subscription_id);
      plans.push(planBilling(row, live, savedRows.find(saved => saved.subscription_id === row.subscription_id), environment, now));
    }
  }
  return plans;
}

export async function applyBilling(conn, grant, initialPlan, environment, client = paddleClient, now = new Date()) {
  if (initialPlan.action === 'no_renewal' || initialPlan.action === 'already_moved') return initialPlan;
  let saved = initialPlan.saved;
  if (!saved) {
    saved = { campaign: grant.campaign, subscription_id: initialPlan.subscriptionId, buyer_id: grant.user_id,
      environment, status: 'prepared', previous_next_billed_at: initialPlan.previousNextBilledAt,
      target_next_billed_at: initialPlan.targetNextBilledAt, snapshot: initialPlan.snapshot };
    // Autocommitted before the HTTP request; never put Paddle inside a SQL transaction.
    await conn.execute(
      `INSERT INTO ${BILLING_TABLE} (campaign, subscription_id, buyer_id, environment, status,
       previous_next_billed_at, target_next_billed_at, snapshot, prepared_at)
       VALUES (?, ?, ?, ?, 'prepared', ?, ?, ?, UTC_TIMESTAMP())`,
      [saved.campaign, saved.subscription_id, saved.buyer_id, environment, saved.previous_next_billed_at,
        saved.target_next_billed_at, JSON.stringify(saved.snapshot)],
    );
  }
  let live = await client.getSubscription(saved.subscription_id);
  const plan = planBilling(initialPlan.row, live, saved, environment, now);
  if (plan.action === 'move_billing') {
    live = await client.moveBillingDate(saved.subscription_id, saved.target_next_billed_at);
    const confirmed = planBilling(initialPlan.row, live, saved, environment, now);
    if (confirmed.action !== 'reconcile') throw new Error('Paddle did not confirm the target billing date');
  }
  await conn.beginTransaction();
  try {
    const [rows] = await conn.execute(
      `SELECT id FROM subscription_systems WHERE subscription_id = ? AND buyer_id = ? AND author_id = ? AND \`system\` = 'paddle' FOR UPDATE`,
      [saved.subscription_id, grant.user_id, PREMIERE_GAL_AUTHOR_ID],
    );
    if (!rows.length) throw new Error('Paddle changed but local subscription is missing; rerun after review');
    const end = sqlDate(asDate(live.current_billing_period.ends_at));
    await conn.execute(
      `UPDATE subscription_systems SET ends_at = GREATEST(COALESCE(ends_at, ?), ?),
       paddle_billing_period_starts_at = ?, paddle_billing_period_ends_at = ?, trial_ends_at = ?, updated_at = UTC_TIMESTAMP()
       WHERE subscription_id = ? AND buyer_id = ? AND author_id = ? AND \`system\` = 'paddle'`,
      [end, end, sqlDate(asDate(live.current_billing_period.starts_at)), end,
        live.status === 'trialing' ? end : null, saved.subscription_id, grant.user_id, PREMIERE_GAL_AUTHOR_ID],
    );
    // The invitation's expiry and the complimentary fallback also reflect Paddle's confirmed date.
    await conn.execute(
      `UPDATE ${CAMPAIGN_TABLE} SET expires_at = GREATEST(COALESCE(expires_at, ?), ?)
       WHERE campaign = ? AND user_id = ? AND action <> 'keep_lifetime'`, [end, end, grant.campaign, grant.user_id],
    );
    if (grant.subscription_id) await conn.execute(
      `UPDATE subscription_systems SET ends_at = GREATEST(COALESCE(ends_at, ?), ?),
       paddle_billing_period_ends_at = GREATEST(COALESCE(paddle_billing_period_ends_at, ?), ?), updated_at = UTC_TIMESTAMP()
       WHERE subscription_id = ? AND buyer_id = ? AND author_id = ? AND \`system\` = 'admin'`,
      [end, end, end, end, grant.subscription_id, grant.user_id, PREMIERE_GAL_AUTHOR_ID],
    );
    await conn.execute(`UPDATE ${BILLING_TABLE} SET status = 'applied', applied_at = UTC_TIMESTAMP() WHERE campaign = ? AND subscription_id = ?`,
      [grant.campaign, saved.subscription_id]);
    await conn.commit();
  } catch (error) { await conn.rollback(); throw error; }
  return { ...plan, action: 'moved' };
}

export function publicBillingPlan(plan) {
  return { userId: plan.userId, subscriptionId: plan.subscriptionId, action: plan.action,
    paddleStatus: plan.paddleStatus || plan.live?.status,
    previousNextBilledAt: plan.previousNextBilledAt || null, targetNextBilledAt: plan.targetNextBilledAt || null };
}
