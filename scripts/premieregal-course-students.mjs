/** Preparation only until an explicit init/apply/send command is chosen. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createHash, randomBytes } from 'node:crypto';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { Resend } from 'resend';
import { PREMIERE_GAL_AUTHOR_ID, PREMIERE_GAL_PRICE_IDS } from '../lib/premiere-gal-paddle-config.ts';
import {
  CAMPAIGN_TABLE, DEFAULT_CAMPAIGN, readParticipants, accessDecision, campaignSubscriptionId,
  sqlDate, retryIsSafe, validateTemplate, renderEmail, mailValues, selectEmailTemplate,
} from './lib/premieregal-course.mjs';
import { BILLING_TABLE, billingEnvironment, previewBilling, applyBilling, publicBillingPlan } from './lib/premieregal-course-billing.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const suffix = lock => lock ? ' FOR UPDATE' : '';
const decode = value => typeof value === 'string' ? JSON.parse(value) : value;

export async function inspectParticipant(conn, participant, campaign, now, journalExists, lock = false) {
  if (journalExists) {
    const [prior] = await conn.execute(
      `SELECT * FROM ${CAMPAIGN_TABLE} WHERE campaign = ? AND account_email = ?${suffix(lock)}`,
      [campaign, participant.accountEmail],
    );
    if (prior[0]) {
      if (prior[0].contact_email !== participant.email) throw new Error(`Record ${participant.line}: applied recipient changed; review manually`);
      return { ...participant, action: 'already_applied', userId: Number(prior[0].user_id), grant: prior[0] };
    }
  }
  const [users] = await conn.execute(
    `SELECT id, email, name FROM users WHERE LOWER(email) IN (?, ?)${suffix(lock)}`,
    [participant.accountEmail, participant.email],
  );
  if (users.length > 1) throw new Error(`Record ${participant.line}: multiple matching accounts; review manually`);
  const user = users[0];
  if (participant.accountEmail !== participant.email && (!user || user.email.toLowerCase() !== participant.accountEmail)) {
    throw new Error(`Record ${participant.line}: signup email not found; review manually`);
  }
  let subscriptions = [];
  if (user) [subscriptions] = await conn.execute(
    `SELECT id, status, plan, ends_at, paddle_billing_period_ends_at FROM subscription_systems
     WHERE buyer_id = ? AND author_id = ?${suffix(lock)}`, [user.id, PREMIERE_GAL_AUTHOR_ID],
  );
  return { ...participant, userId: user ? Number(user.id) : null, createUser: !user, ...accessDecision(subscriptions, now) };
}

export async function transaction(conn, work) {
  await conn.beginTransaction();
  try { const result = await work(); await conn.commit(); return result; }
  catch (error) { await conn.rollback(); throw error; }
}

export async function applyParticipant(conn, participant, campaign, now) {
  return transaction(conn, async () => {
    const plan = await inspectParticipant(conn, participant, campaign, now, true, true);
    if (plan.action === 'already_applied') return plan;
    let userId = plan.userId;
    if (plan.createUser) {
      const base = participant.accountEmail.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 16) || 'student';
      let username;
      for (let i = 0; i < 20; i++) {
        username = `${base}_${randomBytes(4).toString('hex')}`;
        const [taken] = await conn.execute('SELECT id FROM users WHERE name = ?', [username]);
        if (!taken.length) break;
        if (i === 19) throw new Error('Unable to select unique username');
      }
      // Random password is discarded; password setup is sent only at the send stage.
      const hash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
      const [insert] = await conn.execute(
        `INSERT INTO users (name, email, password, first_name, last_name, mailing, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
        [username, participant.accountEmail, hash, participant.firstName, participant.lastName],
      );
      userId = Number(insert.insertId);
      if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error('Invalid new user id');
    }
    let subscriptionId = null;
    if (plan.action !== 'keep_lifetime') {
      subscriptionId = campaignSubscriptionId(campaign, participant.accountEmail);
      // A separate complimentary entitlement survives subsequent Paddle webhook updates.
      await conn.execute(
        `INSERT INTO subscription_systems
         (buyer_id, subscription_id, payment_id, status, amount, amount_summary, price, system_tax,
          \`system\`, type, plan, paddle_price_id, paddle_product_name, count, ends_at,
          paddle_billing_period_ends_at, author_id, author_earn, created_at, updated_at)
         VALUES (?, ?, ?, 1, 0, 0, 0, 0, 'admin', 'personal', 'yearly', ?, 'Gal Toolkit MAX', 1, ?, ?, ?, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
        [userId, subscriptionId, subscriptionId, PREMIERE_GAL_PRICE_IDS.yearly, plan.expiresAt, plan.expiresAt, PREMIERE_GAL_AUTHOR_ID],
      );
    }
    await conn.execute(
      `INSERT INTO ${CAMPAIGN_TABLE}
       (campaign, account_email, contact_email, user_id, created_user, first_name, last_name,
        action, subscription_id, base_at, expires_at, applied_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
      [campaign, participant.accountEmail, participant.email, userId, plan.createUser ? 1 : 0,
        participant.firstName, participant.lastName, plan.action, subscriptionId, plan.baseAt, plan.expiresAt],
    );
    return { ...plan, userId, subscriptionId };
  });
}

function assertSendableEmail(email) {
  for (const key of ['subject', 'text', 'html']) {
    if (/\b(?:PREVIEW_ONLY|TEST_?PREVIEW)\b/i.test(email[key]) || /\{\{[^{}]+\}\}/.test(email[key])) {
      throw new Error('Email contains a preview marker or unresolved template variable; sending blocked');
    }
  }
}

export async function sendParticipant(conn, grant, template, from, siteOrigin, resend, now = new Date()) {
  if (grant.mail_status === 'sent') return { status: 'already_sent' };
  const templateHash = createHash('sha256').update(JSON.stringify({ template, from, siteOrigin })).digest('hex');
  let payload;
  if (grant.mail_status === 'sending') {
    const saved = decode(grant.mail_payload);
    if (!saved || saved.templateHash !== templateHash) throw new Error('Pending email template/settings changed; restore previous settings');
    if (!retryIsSafe(grant.mail_started_at, now)) throw new Error('Email delivery uncertain for over 23 hours; check Resend manually before retrying');
    const [users] = await conn.execute('SELECT id, email, google_id FROM users WHERE id = ?', [grant.user_id]);
    if (!users[0] || users[0].email.toLowerCase() !== grant.account_email) throw new Error('Account deleted or email changed; review manually');
    payload = saved.email;
  } else if (grant.mail_status === 'pending') {
    await transaction(conn, async () => {
      const [users] = await conn.execute('SELECT id, email, google_id FROM users WHERE id = ? FOR UPDATE', [grant.user_id]);
      if (!users[0] || users[0].email.toLowerCase() !== grant.account_email) throw new Error('Account deleted or email changed; review manually');
      let setupUrl = '';
      if (Number(grant.created_user) && !users[0].google_id) {
        if (grant.contact_email !== grant.account_email) throw new Error('Password invite must go to the account email');
        const token = randomBytes(32).toString('hex');
        const hashed = await bcrypt.hash(token, 10);
        await conn.execute(
          `INSERT INTO password_reset_tokens (email, token, created_at) VALUES (?, ?, UTC_TIMESTAMP())
           ON DUPLICATE KEY UPDATE token = VALUES(token), created_at = VALUES(created_at)`, [grant.account_email, hashed],
        );
        setupUrl = `${siteOrigin}/reset-password?${new URLSearchParams({ email: grant.account_email, token, source: 'invite' })}`;
      }
      payload = { from, to: grant.contact_email, ...renderEmail(template, mailValues(grant, siteOrigin, setupUrl)) };
      assertSendableEmail(payload);
      await conn.execute(
        `UPDATE ${CAMPAIGN_TABLE} SET mail_status = 'sending', mail_payload = ?, mail_started_at = ?
         WHERE campaign = ? AND account_email = ? AND mail_status = 'pending'`,
        [JSON.stringify({ templateHash, email: payload }), sqlDate(now), grant.campaign, grant.account_email],
      );
    });
  } else throw new Error(`Unknown mail status: ${grant.mail_status}`);

  assertSendableEmail(payload);
  const idempotencyKey = `course-mail/${campaignSubscriptionId(grant.campaign, grant.account_email)}`;
  const { data, error } = await resend.emails.send(payload, { idempotencyKey });
  if (error || !data?.id) throw new Error(`Resend request failed (${error?.name || 'no_message_id'}); saved email remains retryable`);
  await conn.execute(
    `UPDATE ${CAMPAIGN_TABLE} SET mail_status = 'sent', mail_sent_at = UTC_TIMESTAMP(), mail_provider_id = ?, mail_payload = NULL
     WHERE campaign = ? AND account_email = ?`, [data.id, grant.campaign, grant.account_email],
  );
  return { status: 'sent', providerId: data.id };
}

async function preview(conn, participants, campaign, journalExists) {
  const now = new Date();
  const plans = [];
  const userIds = new Set();
  for (const participant of participants) {
    const plan = await inspectParticipant(conn, participant, campaign, now, journalExists);
    if (plan.userId && userIds.has(plan.userId)) throw new Error(`Record ${participant.line}: account appears twice`);
    if (plan.userId) userIds.add(plan.userId);
    plans.push(plan);
  }
  return plans;
}

function publicPlan(plan) {
  return { record: plan.line, email: plan.email, accountEmail: plan.accountEmail, userId: plan.userId,
    createUser: Boolean(plan.createUser), action: plan.action,
    expiresAt: plan.expiresAt ?? plan.grant?.expires_at ?? null, mailStatus: plan.grant?.mail_status ?? 'pending' };
}

export async function main(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    csv: { type: 'string' }, campaign: { type: 'string', default: DEFAULT_CAMPAIGN },
    template: { type: 'string' }, 'extension-template': { type: 'string' }, from: { type: 'string' }, 'site-origin': { type: 'string' },
    report: { type: 'string' }, 'preview-dir': { type: 'string' }, help: { type: 'boolean' },
  } });
  const command = positionals[0] || 'validate';
  if (values.help) {
    console.log('Commands: validate (default, offline), init, preview (read-only), apply (DB writes), billing-preview (reads DB/Paddle), billing-apply (moves Paddle renewal), mail-preview (read-only), send (email sends).\nOptions: --csv PATH --campaign ID --template JSON --extension-template JSON --from ADDRESS --site-origin HTTPS_ORIGIN --report JSON --preview-dir DIR');
    return;
  }
  if (positionals.length > 1 || !['validate', 'init', 'preview', 'apply', 'billing-preview', 'billing-apply', 'mail-preview', 'send'].includes(command)) throw new Error('Unknown command. Use --help');
  if (!/^[a-z0-9][a-z0-9_-]{0,99}$/.test(values.campaign)) throw new Error('Invalid campaign id');
  const campaign = values.campaign;
  const input = command === 'init' ? null : readParticipants(readFileSync(resolve(required(values.csv, '--csv')), 'utf8'));
  for (const p of input?.participants || []) {
    if (p.firstName.length > 255 || p.lastName.length > 255) throw new Error(`Record ${p.line}: name too long`);
  }
  if (command === 'validate') {
    console.log(JSON.stringify({ command, campaign, records: input.records, unique: input.participants.length,
      duplicates: input.duplicates, separateAccountEmails: input.participants.filter(p => p.email !== p.accountEmail).length }, null, 2));
    return;
  }
  const envFile = resolve(root, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  let template, extensionTemplate, from, siteOrigin;
  if (command === 'send' || command === 'mail-preview') {
    template = validateTemplate(JSON.parse(readFileSync(resolve(required(values.template, '--template')), 'utf8')));
    if (values['extension-template']) extensionTemplate = validateTemplate(JSON.parse(readFileSync(resolve(values['extension-template']), 'utf8')));
    from = required(values.from || (process.env.MAIL_FROM_ADDRESS && `Premiere Gal <${process.env.MAIL_FROM_ADDRESS}>`), '--from or MAIL_FROM_ADDRESS');
    const url = new URL(values['site-origin'] || 'https://premieregal.motionflow.pro');
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || /^(localhost|127\.|0\.|\[::1\])/.test(url.hostname)) {
      throw new Error('--site-origin must be a public HTTPS origin');
    }
    siteOrigin = url.origin;
    if (command === 'send') required(process.env.RESEND_API_KEY, 'RESEND_API_KEY');
  }
  const conn = await mysql.createConnection({
    host: required(process.env.DB_HOST, 'DB_HOST'), port: Number(process.env.DB_PORT || 3306),
    user: required(process.env.DB_USERNAME, 'DB_USERNAME'), password: process.env.DB_PASSWORD,
    database: required(process.env.DB_DATABASE, 'DB_DATABASE'), timezone: 'Z', dateStrings: true,
  });
  let acquiredLock = false;
  const lockName = `course:${createHash('sha256').update(`${process.env.DB_DATABASE}/${campaign}`).digest('hex').slice(0, 50)}`;
  try {
    await conn.execute("SET time_zone = '+00:00'");
    if (['init', 'apply', 'billing-apply', 'send'].includes(command)) {
      const [locks] = await conn.execute('SELECT GET_LOCK(?, 0) AS acquired', [lockName]);
      if (Number(locks[0].acquired) !== 1) throw new Error('Another process is working on this campaign');
      acquiredLock = true;
    }
    if (command === 'init') {
      await conn.query(readFileSync(resolve(root, 'db/migrations/2026_10_08_premieregal_course_grants.sql'), 'utf8'));
      await conn.query(readFileSync(resolve(root, 'db/migrations/2026_10_08_premieregal_course_billing.sql'), 'utf8'));
      console.log('Course grant and billing journals created. No accounts, subscriptions or emails processed.');
      return;
    }
    const [tables] = await conn.execute('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [CAMPAIGN_TABLE]);
    const journalExists = Boolean(tables.length);
    if (!journalExists && command !== 'preview') throw new Error('Run init explicitly before apply/mail-preview/send');
    if (command === 'apply' || command === 'send' || command === 'billing-apply') {
      const requiredTables = ['users', 'subscription_systems', CAMPAIGN_TABLE];
      const [engines] = await conn.execute(
        'SELECT TABLE_NAME AS name, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?, ?, ?)', requiredTables,
      );
      if (engines.length !== requiredTables.length || engines.some(t => t.engine?.toUpperCase() !== 'INNODB')) {
        throw new Error('Users, subscriptions and campaign journal must use InnoDB for atomic processing');
      }
    }
    const plans = await preview(conn, input.participants, campaign, journalExists);
    if (command === 'preview') {
      const report = { command, campaign, journalExists, participants: plans.map(publicPlan) };
      if (values.report) writeFileSync(resolve(values.report), JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    if (command === 'apply') {
      await conn.execute("SET @account_audit_actor_id = NULL, @account_audit_source = 'premieregal.course'");
      const results = [];
      for (const participant of input.participants) {
        const result = publicPlan(await applyParticipant(conn, participant, campaign, new Date()));
        results.push(result); console.log(JSON.stringify(result));
      }
      if (values.report) writeFileSync(resolve(values.report), JSON.stringify({ campaign, participants: results }, null, 2));
      return;
    }
    if (plans.some(p => p.action !== 'already_applied')) throw new Error('Apply access to every CSV participant before billing/mail commands');
    const grants = plans.map(p => p.grant);
    if (['billing-preview', 'billing-apply', 'send'].includes(command)) {
      const [billingTables] = await conn.execute(
        'SELECT ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [BILLING_TABLE],
      );
      if (billingTables[0]?.engine?.toUpperCase() !== 'INNODB') throw new Error('Run init explicitly to create the InnoDB billing journal');
      // Full read-only preflight first. No PATCH until every subscription in the CSV is valid.
      const billingPlans = await previewBilling(conn, grants);
      if (command === 'billing-preview') {
        const report = { command, campaign, subscriptions: billingPlans.map(publicBillingPlan) };
        if (values.report) writeFileSync(resolve(values.report), JSON.stringify(report, null, 2));
        console.log(JSON.stringify(report, null, 2));
        return;
      }
      if (command === 'billing-apply') {
        const results = [];
        for (const plan of billingPlans) {
          const grant = grants.find(g => Number(g.user_id) === plan.userId);
          const result = publicBillingPlan(await applyBilling(conn, grant, plan, billingEnvironment()));
          results.push(result); console.log(JSON.stringify(result));
        }
        if (values.report) writeFileSync(resolve(values.report), JSON.stringify({ command, campaign, subscriptions: results }, null, 2));
        console.log(JSON.stringify({ command, processed: results.length }));
        return;
      }
      if (billingPlans.some(p => !['already_moved', 'no_renewal'].includes(p.action))) {
        throw new Error('Complete billing-apply before sending emails: Paddle renewal has not been moved/synchronized');
      }
    }
    if (command === 'mail-preview') {
      const directory = resolve(values['preview-dir'] || resolve(root, '.campaigns', campaign, 'preview'));
      mkdirSync(directory, { recursive: true });
      for (const grant of grants) {
        const setup = Number(grant.created_user) ? `${siteOrigin}/reset-password?email=${encodeURIComponent(grant.account_email)}&token=PREVIEW_ONLY&source=invite` : '';
        const message = renderEmail(selectEmailTemplate(grant, template, extensionTemplate), mailValues(grant, siteOrigin, setup));
        const filename = campaignSubscriptionId(campaign, grant.account_email);
        writeFileSync(resolve(directory, `${filename}.html`), message.html);
        writeFileSync(resolve(directory, `${filename}.txt`), `${message.subject}\nTo: ${grant.contact_email}\n\n${message.text}`);
      }
      console.log(JSON.stringify({ previewDirectory: directory, count: grants.length, sent: 0 }));
      return;
    }
    // Check the reset table before generating any password links or sending emails.
    if (grants.some(g => Number(g.created_user) && g.mail_status === 'pending')) {
      await conn.execute('SELECT email, token, created_at FROM password_reset_tokens LIMIT 0');
      const [resetEngine] = await conn.execute(
        "SELECT ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'password_reset_tokens'",
      );
      if (resetEngine[0]?.engine?.toUpperCase() !== 'INNODB') throw new Error('Password reset table must use InnoDB');
    }
    const resend = new Resend(process.env.RESEND_API_KEY);
    for (const grant of grants) {
      const result = await sendParticipant(conn, grant, selectEmailTemplate(grant, template, extensionTemplate), from, siteOrigin, resend);
      console.log(JSON.stringify({ email: grant.contact_email, ...result }));
      if (result.status === 'sent') await new Promise(done => setTimeout(done, 600));
    }
  } finally {
    try {
      if (acquiredLock) await conn.execute('SELECT RELEASE_LOCK(?)', [lockName]);
    } finally { await conn.end(); }
  }
}

function required(value, name) {
  if (!value?.trim()) throw new Error(`Missing ${name}`);
  return value.trim();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`[premieregal-course] ${error.message}`); process.exitCode = 1; });
}
