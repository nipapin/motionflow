import { randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { accessPlan, asDate, sqlDate, stableId, subscriptionScope, paddlePlan, billingRecovery, renderCampaignEmail, assertSendable, soldItemAccessCondition } from './core.mjs';

export const decode = value => typeof value === 'string' ? JSON.parse(value) : value;
const signature = rows => createHash('sha256').update(JSON.stringify(rows.map(r => [Number(r.id),r.status,r.plan,r.ends_at ? sqlDate(asDate(r.ends_at)) : null,r.paddle_billing_period_ends_at ? sqlDate(asDate(r.paddle_billing_period_ends_at)) : null,r.subscription_id,r.paddle_price_id]).sort())).digest('hex');
const querySubscriptions = async (conn, userId) => (await conn.execute('SELECT id, buyer_id, author_id, status, plan, `system`, subscription_id, paddle_price_id, ends_at, paddle_billing_period_ends_at FROM subscription_systems WHERE buyer_id = ?', [userId]))[0];

export async function inspectRecipient(conn, campaign, recipient, services, now = new Date()) {
  const [users] = await conn.execute('SELECT id, name, email, google_id FROM users WHERE LOWER(email) IN (?, ?)', [recipient.account_email, recipient.email]);
  if (users.length > 1) throw new Error('Recipient email and account email match different accounts');
  const user = users[0] || null;
  if (recipient.account_email !== recipient.email && (!user || user.email.toLowerCase() !== recipient.account_email)) throw new Error('The separate account email was not found');
  const base = {user_id:user ? Number(user.id) : null,created_user:user ? 0 : 1,action:'invite',base_at:null,expires_at:null,billing:[],snapshot:null};
  if (campaign.grant.kind === 'invite') return base;
  if (campaign.grant.kind === 'item') {
    let rows = [];
    if (user) [rows] = await conn.execute(`SELECT id, \`system\`, arguments FROM sold_items WHERE buyer_id = ? AND item_id = ? AND ${soldItemAccessCondition()}`, [user.id,campaign.grant.itemId]);
    if (rows.some(row => row.system !== 'campaign' || !decode(row.arguments)?.access_expires_at)) return {...base,action:'keep_existing'};
    const periods = rows.map(row => ({status:1,ends_at:decode(row.arguments).access_expires_at}));
    return {...base,...accessPlan(periods,campaign.grant.duration,now)};
  }
  const catalog = services.catalog(campaign.grant.subscription,campaign.grant.duration);
  if (!catalog.priceId) throw new Error('The selected subscription price is not configured');
  const original = user ? subscriptionScope(await querySubscriptions(conn,user.id),catalog) : [];
  const rows = original.map(row => ({...row}));
  const billing = [];
  for (const row of rows) if (row.system === 'paddle' && [1,-1].includes(Number(row.status))) {
    if (!/^sub_[a-z0-9]{26}$/.test(row.subscription_id)) throw new Error('Legacy Paddle subscription needs manual review');
    const sub = await services.paddle.get(row.subscription_id,catalog.account);
    const plan = paddlePlan(row,sub,catalog,campaign.grant.duration,now);
    if (sub.current_billing_period?.ends_at) row.paddle_billing_period_ends_at = sub.current_billing_period.ends_at;
    if (plan) billing.push(plan);
  }
  const decision = accessPlan(rows,campaign.grant.duration,now);
  if (decision.action !== 'keep_existing' && catalog.tierPriceIds && rows.some(row => [1,-1].includes(Number(row.status)) && catalog.allPriceIds.includes(row.paddle_price_id) && !catalog.tierPriceIds.includes(row.paddle_price_id) && [row.ends_at,row.paddle_billing_period_ends_at].some(value=>value && asDate(value)>now))) throw new Error('Current subscription has a different tier; choose its tier or review the change manually');
  if (decision.action === 'keep_existing' && billing.length) throw new Error('A lifetime account has recurring Paddle billing; resolve it manually before launching');
  for (const plan of billing) if (decision.expires_at && asDate(decision.expires_at) > asDate(plan.target)) plan.target = asDate(decision.expires_at).toISOString();
  return {...base,...decision,billing:decision.action === 'keep_existing' ? [] : billing,snapshot:signature(original)};
}

async function transaction(conn, work) {
  await conn.beginTransaction();
  try { const value = await work(); await conn.commit(); return value; }
  catch (error) { await conn.rollback(); throw error; }
}

export async function applyRecipient(conn, campaign, recipient, services, now = new Date()) {
  if (['ready','sending','sent'].includes(recipient.state)) return recipient;
  const userLock = `campaign-user:${createHash('sha256').update(recipient.account_email).digest('hex').slice(0,40)}`;
  const [locks] = await conn.execute('SELECT GET_LOCK(?, 0) AS acquired',[userLock]);
  if (Number(locks[0].acquired) !== 1) throw new Error('Another campaign is processing this account; retry shortly');
  try {
    if (recipient.state === 'pending') {
      const plan = await inspectRecipient(conn,campaign,recipient,services,now);
      recipient = await transaction(conn,async () => {
        let userId = plan.user_id;
        if (userId) {
          const [users] = await conn.execute('SELECT id, email FROM users WHERE id = ? FOR UPDATE',[userId]);
          if (users[0]?.email.toLowerCase() !== recipient.account_email) throw new Error('Account changed while preparing access');
          if (campaign.grant.kind === 'subscription') {
            const catalog = services.catalog(campaign.grant.subscription,campaign.grant.duration);
            if (signature(subscriptionScope(await querySubscriptions(conn,userId),catalog)) !== plan.snapshot) throw new Error('Current subscription changed; retry to recalculate');
          }
        } else {
          const username = `campaign_${randomBytes(10).toString('hex')}`;
          const hash = await bcrypt.hash(randomBytes(32).toString('hex'),10);
          const [created] = await conn.execute('INSERT INTO users (name,email,password,first_name,last_name,mailing,created_at,updated_at) VALUES (?,?,?,?,?,0,UTC_TIMESTAMP(),UTC_TIMESTAMP())',[username,recipient.account_email,hash,recipient.first_name,recipient.last_name]);
          userId = Number(created.insertId);
        }
        const entitlement = stableId(campaign.id,recipient.account_email);
        if (campaign.grant.kind === 'subscription' && plan.action !== 'keep_existing') {
          const catalog = services.catalog(campaign.grant.subscription,campaign.grant.duration);
          await conn.execute("INSERT INTO subscription_systems (buyer_id,subscription_id,payment_id,status,amount,amount_summary,price,system_tax,`system`,type,plan,paddle_price_id,paddle_product_name,count,ends_at,paddle_billing_period_ends_at,author_id,author_earn,created_at,updated_at) VALUES (?,?,?,1,0,0,0,0,'admin','personal',?,?,?,1,?,?,?,0,UTC_TIMESTAMP(),UTC_TIMESTAMP())",[userId,entitlement,entitlement,catalog.plan,catalog.priceId,catalog.name,plan.expires_at,plan.expires_at,catalog.authorId]);
        }
        if (campaign.grant.kind === 'item' && plan.action !== 'keep_existing') {
          const code = createHash('md5').update(`order${campaign.grant.itemId}${userId}${entitlement}`).digest('hex');
          await conn.execute("INSERT INTO sold_items (buyer_id,author_id,item_id,status,payment_id,sold_price,sold_summary,sold_net,license,qty,`system`,system_tax,arguments,platform_earn,purchase_code,author_earn,created_at,updated_at) VALUES (?,?,?,1,?,0,0,0,1,1,'campaign',0,?,0,?,0,UTC_TIMESTAMP(),UTC_TIMESTAMP())",[userId,services.item.author_id,campaign.grant.itemId,entitlement,JSON.stringify({source:'admin_campaign',campaign_id:campaign.id,access_expires_at:plan.expires_at}),code]);
        }
        await conn.execute("UPDATE admin_campaign_recipients SET user_id=?,created_user=?,action=?,base_at=?,expires_at=?,entitlement_id=?,billing_json=?,state='applied',last_error=NULL WHERE id=? AND state='pending'",[userId,plan.created_user,plan.action,plan.base_at,plan.expires_at,entitlement,JSON.stringify(plan.billing),recipient.id]);
        return {...recipient,...plan,user_id:userId,entitlement_id:entitlement,billing_json:plan.billing,state:'applied'};
      });
    }
    if (recipient.state === 'applied') {
      const plans = decode(recipient.billing_json) || [];
      if (plans.length) {
        const catalog = services.catalog(campaign.grant.subscription,campaign.grant.duration);
        for (const plan of plans) {
          let sub = await services.paddle.get(plan.id,catalog.account);
          if (billingRecovery(plan,sub,catalog,now) === 'move') sub = await services.paddle.move(plan.id,plan.target,catalog.account);
          if (billingRecovery(plan,sub,catalog,now) !== 'synced') throw new Error('Paddle did not confirm the new billing date');
          await transaction(conn,async () => {
            const [owners] = await conn.execute('SELECT id FROM subscription_systems WHERE id=? AND buyer_id=? AND subscription_id=? FOR UPDATE',[plan.row_id,recipient.user_id,plan.id]);
            if (!owners.length) throw new Error('Paddle subscription owner changed; review manually');
            const end = sqlDate(asDate(plan.target));
            await conn.execute('UPDATE subscription_systems SET ends_at=GREATEST(COALESCE(ends_at,?),?),paddle_billing_period_ends_at=?,updated_at=UTC_TIMESTAMP() WHERE id=?',[end,end,end,plan.row_id]);
            plan.state = 'applied';
            await conn.execute('UPDATE admin_campaign_recipients SET billing_json=?,last_error=NULL WHERE id=?',[JSON.stringify(plans),recipient.id]);
          });
        }
      }
      await conn.execute("UPDATE admin_campaign_recipients SET state='ready',last_error=NULL WHERE id=? AND state='applied'",[recipient.id]);
      return {...recipient,state:'ready'};
    }
    return recipient;
  } finally { await conn.execute('SELECT RELEASE_LOCK(?)',[userLock]); }
}

export async function sendRecipient(conn, campaign, recipient, services, now = new Date()) {
  if (recipient.state === 'sent') return;
  if (!['ready','sending'].includes(recipient.state)) throw new Error('Access and Paddle synchronization must finish before sending');
  const [users] = await conn.execute('SELECT id,email,google_id FROM users WHERE id=?',[recipient.user_id]);
  const user = users[0];
  if (user?.email.toLowerCase() !== recipient.account_email) throw new Error('Account email changed; review manually');
  const plans = decode(recipient.billing_json) || [];
  if (plans.length) {
    const catalog = services.catalog(campaign.grant.subscription,campaign.grant.duration);
    for (const plan of plans) if (plan.state !== 'applied' || billingRecovery(plan,await services.paddle.get(plan.id,catalog.account),catalog,now) !== 'synced') throw new Error('Paddle renewal is not synchronized');
  }
  let outbox = decode(recipient.outbox_json);
  if (recipient.state === 'sending') {
    if (!outbox || now.getTime() - asDate(recipient.mail_started_at).getTime() >= 23*3600000) throw new Error('Delivery is uncertain for more than 23 hours; check Resend before retrying');
  } else outbox = await transaction(conn,async () => {
    let setup = '';
    if (Number(recipient.created_user) && !user.google_id) {
      if (recipient.email !== recipient.account_email) throw new Error('A personal invitation must be sent to the account email');
      const token = randomBytes(32).toString('hex');
      const hash = await bcrypt.hash(token,10);
      await conn.execute('INSERT INTO password_reset_tokens (email,token,created_at) VALUES (?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE token=VALUES(token),created_at=VALUES(created_at)',[recipient.account_email,hash]);
      setup = `${campaign.site_origin.replace(/\/$/,'')}/reset-password?${new URLSearchParams({email:recipient.account_email,token,source:'invite'})}`;
    }
    const payload = {from:services.from,to:recipient.email,...renderCampaignEmail(campaign,recipient,setup)};
    assertSendable(payload);
    const box = {payload,idempotencyKey:`admin-campaign/${stableId(campaign.id,recipient.account_email)}`};
    await conn.execute("UPDATE admin_campaign_recipients SET state='sending',outbox_json=?,mail_started_at=?,last_error=NULL WHERE id=? AND state='ready'",[JSON.stringify(box),sqlDate(now),recipient.id]);
    return box;
  });
  assertSendable(outbox.payload);
  const {data,error} = await services.mail.emails.send(outbox.payload,{idempotencyKey:outbox.idempotencyKey});
  if (error || !data?.id) throw new Error('Resend did not confirm receipt; the saved message can be retried');
  await conn.execute("UPDATE admin_campaign_recipients SET state='sent',provider_id=?,sent_at=UTC_TIMESTAMP(),outbox_json=NULL,last_error=NULL WHERE id=?",[data.id,recipient.id]);
}
