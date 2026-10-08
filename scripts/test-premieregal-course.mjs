import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { test } from 'node:test';
import {
  parseCsv, readParticipants, accessDecision, addYear, renderEmail, validateTemplate, retryIsSafe, mailValues, selectEmailTemplate,
} from './lib/premieregal-course.mjs';
import { applyParticipant, inspectParticipant, sendParticipant } from './premieregal-course-students.mjs';

const headers = 'First Name,Last Name,Phone,Email,Do you have a Gal Toolkit MAX plan?,Which plan do you already have?,What email did you use to sign up for the Gal Tookit MAX?';
const now = new Date('2026-10-08T10:00:00Z');
const participant = { line: 2, email: 'student@example.com', accountEmail: 'student@example.com', firstName: 'Student', lastName: 'Example' };
const template = { subject: 'Hello {{first_name}}', text: 'Access until {{expires_at}}', html: '<p>{{first_name}}: {{expires_at}}</p>' };

test('CSV supports BOM, CRLF, multiline quotes and escaped quotes', () => {
  assert.deepEqual(parseCsv('\uFEFFa,b\r\n"A, B","two\n""words"""\r\n'), [['a', 'b'], ['A, B', 'two\n"words"']]);
  assert.throws(() => parseCsv('a\n"unclosed'), /Unclosed/);
  assert.throws(() => parseCsv('a\n"closed"junk'), /Malformed/);
});

test('email normalization, signup email and duplicates are validated before DB operations', () => {
  const row = 'First,Last,, CONTACT@example.com ,Yes,Annual,ACCOUNT@example.com';
  const result = readParticipants(`${headers}\n${row}\n${row}\n`);
  assert.equal(result.participants[0].email, 'contact@example.com');
  assert.equal(result.participants[0].accountEmail, 'account@example.com');
  assert.equal(result.duplicates, 1);
  assert.throws(() => readParticipants(`${headers}\n${row}\nOther,Last,,CONTACT@example.com,No,,`), /conflicting duplicate/);
  assert.throws(() => readParticipants(`${headers}\nFirst,Last,,invalid,No,,`), /invalid email/);
  assert.throws(() => readParticipants('Email\na@example.com'), /Missing CSV column/);
});

test('adds a calendar year to latest active access, including cancelled paid periods', () => {
  const decision = accessDecision([
    { status: 1, ends_at: '2026-12-01 00:00:00', paddle_billing_period_ends_at: '2027-01-01 00:00:00' },
    { status: -1, ends_at: '2027-02-01 00:00:00' },
    { status: 0, ends_at: '2030-01-01 00:00:00' },
  ], now);
  assert.equal(decision.action, 'extend_access');
  assert.equal(decision.expiresAt, '2028-02-01 00:00:00');
  assert.equal(accessDecision([{ status: -1, ends_at: '2020-01-01 00:00:00' }], now).expiresAt, '2027-10-08 10:00:00');
  assert.equal(addYear(new Date('2024-02-29T12:00:00Z')).toISOString(), '2025-02-28T12:00:00.000Z');
  assert.equal(accessDecision([], now).action, 'grant_access');
});

test('lifetime access is preserved and corrupt dates fail closed', () => {
  assert.equal(accessDecision([{ status: 1, plan: 'lifetime' }], now).action, 'keep_lifetime');
  assert.equal(accessDecision([{ status: 1, ends_at: null }], now).expiresAt, null);
  assert.throws(() => accessDecision([{ status: 1, ends_at: 'bad' }], now), /Invalid subscription date/);
});

function fixture({ users = [{ id: 7, email: participant.email }], subscriptions = [], prior = [], failJournal = false } = {}) {
  const events = [];
  const calls = [];
  const conn = {
    beginTransaction: async () => events.push('begin'), commit: async () => events.push('commit'), rollback: async () => events.push('rollback'),
    execute: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('SELECT * FROM premieregal_course_grants')) return [prior];
      if (sql.includes('SELECT id, email, name FROM users')) return [users];
      if (sql.includes('SELECT id FROM users WHERE name')) return [[]];
      if (sql.includes('SELECT id, status, plan')) return [subscriptions];
      if (sql.includes('INSERT INTO users')) return [{ insertId: 8 }];
      if (sql.includes('INSERT INTO premieregal_course_grants') && failJournal) throw new Error('Journal write failed');
      if (sql.includes('SELECT id, email, google_id')) return [[{ id: 7, email: participant.email }]];
      return [{ affectedRows: 1 }];
    },
  };
  return { conn, calls, events };
}

test('new account and annual access are created atomically without sending invitations', async () => {
  const f = fixture({ users: [] });
  const result = await applyParticipant(f.conn, participant, 'course', now);
  assert.equal(result.createUser, true);
  assert.equal(result.userId, 8);
  assert.deepEqual(f.events, ['begin', 'commit']);
  const create = f.calls.find(q => q.sql.includes('INSERT INTO users'));
  assert.match(create.params[2], /^\$2[aby]\$/);
  assert.ok(!create.sql.includes('email_verified_at'));
  assert.ok(!f.calls.some(q => q.sql.includes('password_reset_tokens')));
});

test('paid subscription remains intact; separate admin entitlement adds a year', async () => {
  const f = fixture({ subscriptions: [{ id: 10, status: 1, ends_at: '2027-01-15 00:00:00' }] });
  const result = await applyParticipant(f.conn, participant, 'course', now);
  assert.equal(result.expiresAt, '2028-01-15 00:00:00');
  assert.ok(f.calls.some(q => q.sql.includes('INSERT INTO subscription_systems') && q.sql.includes("'admin'")));
  assert.ok(!f.calls.some(q => /UPDATE subscription_systems|UPDATE users/.test(q.sql)));
});

test('repeat run performs no writes and journal failure rolls back the whole participant', async () => {
  const f = fixture({ prior: [{ user_id: 7, contact_email: participant.email }] });
  assert.equal((await applyParticipant(f.conn, participant, 'course', now)).action, 'already_applied');
  assert.ok(f.calls.every(q => q.sql.startsWith('SELECT')));
  const broken = fixture({ users: [], failJournal: true });
  await assert.rejects(applyParticipant(broken.conn, participant, 'course', now), /Journal write failed/);
  assert.deepEqual(broken.events, ['begin', 'rollback']);
});

test('conflicting account emails stop before any mutation', async () => {
  const f = fixture({ users: [{ id: 7, email: participant.email }, { id: 8, email: 'other@example.com' }] });
  await assert.rejects(inspectParticipant(f.conn, { ...participant, accountEmail: 'other@example.com' }, 'course', now, false), /multiple matching/);
  const missing = fixture({ users: [] });
  await assert.rejects(inspectParticipant(missing.conn, { ...participant, accountEmail: 'other@example.com' }, 'course', now, false), /signup email not found/);
  assert.ok(f.calls.every(q => q.sql.startsWith('SELECT')));
});

test('email escapes participant HTML, rejects unknown variables and includes new account setup', () => {
  const email = renderEmail(template, { first_name: '<script>', expires_at: '2027', setup_password_url: 'https://example.com/?a=1&b=2' });
  assert.match(email.html, /&lt;script&gt;/);
  assert.match(email.html, /Set your password/);
  assert.match(email.text, /https:\/\/example.com/);
  assert.throws(() => validateTemplate({ ...template, text: '{{unknown}}' }), /Unknown/);
  assert.throws(() => validateTemplate({ ...template, subject: '{{setup_password_url}}' }), /Password link/);
});

const grant = { campaign: 'course', user_id: 7, account_email: participant.email, contact_email: participant.email,
  first_name: 'Student', last_name: 'Example', created_user: 1, expires_at: '2027-10-08 10:00:00', mail_status: 'pending' };

test('course email directs new accounts to password setup and existing accounts to the website', () => {
  const courseTemplate = JSON.parse(readFileSync(new URL('../docs/email-templates/premieregal-course.json', import.meta.url), 'utf8'));
  const origin = 'https://premieregal.motionflow.pro';
  const setup = `${origin}/reset-password?email=student%40example.com&token=PREVIEW_ONLY&source=invite`;
  const newAccount = renderEmail(courseTemplate, mailValues(grant, origin, setup));
  assert.match(newAccount.html, /href="https:\/\/premieregal\.motionflow\.pro\/reset-password\?email=student%40example\.com&amp;token=PREVIEW_ONLY&amp;source=invite"/);
  assert.match(newAccount.text, /Set your password/);
  assert.match(newAccount.text, /valid for 7 days/);
  assert.match(newAccount.text, /October 8, 2027/);
  assert.ok(newAccount.html.endsWith('</html>'), 'the setup link belongs inside the email, not an appended fragment');
  assert.match(newAccount.text, /student@example\.com/);
  assert.ok(!newAccount.text.includes('{{'));
  const existing = renderEmail(courseTemplate, mailValues({ ...grant, created_user: 0 }, origin));
  assert.match(existing.html, /href="https:\/\/premieregal\.motionflow\.pro\/"/);
  assert.match(existing.text, /usual password or Continue with Google/);
  assert.ok(!existing.html.includes('/reset-password'));
  assert.ok(!existing.text.includes('Set your password'));
  assert.ok(!existing.html.includes('{{'));
  const lifetime = renderEmail(courseTemplate, mailValues({ ...grant, expires_at: null }, origin));
  assert.match(lifetime.text, /lifetime access/);
  assert.throws(() => validateTemplate({ ...courseTemplate, subject: '{{access_url}}' }), /Password link/);
});

test('extension email describes a year after current access and is reserved for existing subscribers', async () => {
  const baseTemplate = JSON.parse(readFileSync(new URL('../docs/email-templates/premieregal-course.json', import.meta.url), 'utf8'));
  const extensionTemplate = JSON.parse(readFileSync(new URL('../docs/email-templates/premieregal-course-extension.json', import.meta.url), 'utf8'));
  const subscriber = { ...grant, created_user: 0, action: 'extend_access', base_at: '2027-01-15 00:00:00', expires_at: '2028-01-15 00:00:00' };
  const selected = selectEmailTemplate(subscriber, baseTemplate, extensionTemplate);
  const email = renderEmail(selected, mailValues(subscriber, 'https://premieregal.motionflow.pro'));
  assert.match(email.subject, /extended by one year/);
  assert.match(email.text, /extra year begins when your current subscription period ends/);
  assert.match(email.text, /January 15, 2028/);
  assert.match(email.html, /href="https:\/\/premieregal\.motionflow\.pro\/"/);
  assert.ok(!email.html.includes('/reset-password'));
  assert.ok(!email.text.includes('Set your password'));
  assert.ok(!email.html.includes('{{'));
  for (const other of [grant, { ...subscriber, action: 'grant_access' }, { ...subscriber, action: 'keep_lifetime', expires_at: null }]) {
    assert.equal(selectEmailTemplate(other, baseTemplate, extensionTemplate), baseTemplate);
  }
  assert.equal(selectEmailTemplate(subscriber, baseTemplate), baseTemplate);
  const f = fixture();
  let sent;
  const resend = { emails: { send: async payload => { sent = payload; return { data: { id: 'extension-1' } }; } } };
  await sendParticipant(f.conn, subscriber, selected, 'Gal <hello@example.com>', 'https://premieregal.motionflow.pro', resend, now);
  assert.equal(sent.subject, email.subject);
  assert.ok(!f.calls.some(q => q.sql.includes('password_reset_tokens')));
});

test('mail outbox and password hash are committed before a send; success clears stored password link', async () => {
  const f = fixture();
  const courseTemplate = JSON.parse(readFileSync(new URL('../docs/email-templates/premieregal-course.json', import.meta.url), 'utf8'));
  let sent;
  const resend = { emails: { send: async (payload, options) => {
    assert.deepEqual(f.events, ['begin', 'commit']);
    assert.ok(f.calls.some(q => q.sql.includes("mail_status = 'sending'")));
    sent = { payload, options }; return { data: { id: 'mail-1' } };
  } } };
  assert.equal((await sendParticipant(f.conn, grant, courseTemplate, 'Gal <hello@example.com>', 'https://premieregal.motionflow.pro', resend, now)).status, 'sent');
  assert.match(sent.payload.text, /source=invite/);
  const link = new URL(sent.payload.text.match(/https:\/\/premieregal\.motionflow\.pro\/reset-password\?\S+/)[0]);
  assert.equal(link.searchParams.get('email'), grant.account_email);
  const token = link.searchParams.get('token');
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.ok(!/PREVIEW|\{\{/.test(sent.payload.text + sent.payload.html));
  assert.ok(sent.payload.html.includes(token), 'HTML and plain text use the same real token');
  const savedToken = f.calls.find(q => q.sql.includes('INSERT INTO password_reset_tokens'));
  assert.equal(savedToken.params[0], grant.account_email);
  assert.ok(await bcrypt.compare(token, savedToken.params[1]), 'the emailed token matches the stored bcrypt hash');
  assert.equal(sent.payload.to, grant.contact_email);
  assert.match(sent.options.idempotencyKey, /^course-mail\//);
  assert.ok(f.calls.some(q => q.sql.includes('mail_payload = NULL')));
});

test('sending refuses preview markers and unresolved variables before calling the mail provider', async () => {
  const resend = { emails: { send: async () => assert.fail('invalid email must not reach the provider') } };
  const existing = { ...grant, created_user: 0 };
  for (const marker of ['PREVIEW_ONLY', 'TEST_Preview', '{{first_name}}']) {
    const f = fixture();
    const values = marker.startsWith('{{') ? { ...existing, first_name: marker } : existing;
    const unsafe = { ...template, text: marker };
    await assert.rejects(sendParticipant(f.conn, values, unsafe, 'Gal', 'https://premieregal.motionflow.pro', resend, now), /sending blocked/);
    assert.deepEqual(f.events, ['begin', 'rollback']);
  }
  const f = fixture();
  const pending = { ...existing, mail_status: 'sending', mail_started_at: now, mail_payload: {
    templateHash: null, email: { subject: 'Preview', text: 'TEST_PREVIEW', html: '<p>TEST_PREVIEW</p>' },
  } };
  // Preserve the normal retry hash by capturing a prepared payload before the injected provider failure.
  const prepared = fixture();
  await assert.rejects(sendParticipant(prepared.conn, existing, template, 'Gal', 'https://premieregal.motionflow.pro', {
    emails: { send: async () => { throw new Error('network timeout'); } },
  }, now), /network timeout/);
  const saved = JSON.parse(prepared.calls.find(q => q.sql.includes("mail_status = 'sending'")).params[0]);
  pending.mail_payload.templateHash = saved.templateHash;
  await assert.rejects(sendParticipant(f.conn, pending, template, 'Gal', 'https://premieregal.motionflow.pro', resend, now), /sending blocked/);
});

test('unknown delivery retains exact outbox payload; repeat uses same key and no new password token', async () => {
  const f = fixture();
  const sent = [];
  const resend = { emails: { send: async (payload, options) => { sent.push({ payload, options }); throw new Error('network timeout'); } } };
  await assert.rejects(sendParticipant(f.conn, grant, template, 'Gal', 'https://example.com', resend, now), /network timeout/);
  const outbox = f.calls.find(q => q.sql.includes("mail_status = 'sending'"));
  const retry = { ...grant, mail_status: 'sending', mail_payload: outbox.params[0], mail_started_at: outbox.params[1] };
  const before = f.calls.length;
  await assert.rejects(sendParticipant(f.conn, retry, template, 'Gal', 'https://example.com', resend, now), /network timeout/);
  assert.ok(f.calls.slice(before).every(q => q.sql.startsWith('SELECT')));
  assert.deepEqual(sent[0], sent[1]);
  await assert.rejects(sendParticipant(f.conn, retry, template, 'Gal', 'https://example.com', resend, new Date('2026-10-09T10:00:00Z')), /check Resend manually/);
  await assert.rejects(sendParticipant(f.conn, retry, { ...template, subject: 'changed' }, 'Gal', 'https://example.com', resend, now), /settings changed/);
});

test('already-sent mail never calls provider and old unknown deliveries cannot resend automatically', async () => {
  const f = fixture();
  assert.equal((await sendParticipant(f.conn, { ...grant, mail_status: 'sent' }, template, 'Gal', 'https://example.com', null, now)).status, 'already_sent');
  assert.equal(f.calls.length, 0);
  assert.equal(retryIsSafe('2026-10-07 10:00:00', now), false);
});
