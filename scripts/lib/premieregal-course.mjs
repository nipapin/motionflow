import { createHash } from 'node:crypto';

export const CAMPAIGN_TABLE = 'premieregal_course_grants';
export const DEFAULT_CAMPAIGN = 'premieregal-course-free-year';

// Strict CSV reader: quoted commas/newlines, escaped quotes, CRLF and UTF-8 BOM.
export function parseCsv(input) {
  const rows = [];
  let row = [], field = '', quoted = false, closed = false;
  const source = input.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else field += c;
    } else if (c === ',' || c === '\n' || c === '\r') {
      row.push(field); field = ''; closed = false;
      if (c !== ',') {
        if (row.some(v => v.trim())) rows.push(row);
        row = [];
        if (c === '\r' && source[i + 1] === '\n') i++;
      }
    } else if (c === '"' && field === '' && !closed) quoted = true;
    else {
      if (closed || c === '"') throw new Error('Malformed CSV quoting');
      field += c;
    }
  }
  if (quoted) throw new Error('Unclosed CSV quote');
  row.push(field);
  if (row.some(v => v.trim())) rows.push(row);
  return rows;
}

const normalizeEmail = value => value.trim().toLowerCase();
const validEmail = value => value.length <= 255 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value);

export function readParticipants(csv) {
  const [headers, ...rows] = parseCsv(csv);
  if (!headers) throw new Error('Empty CSV');
  const columns = headers.map(v => v.trim());
  if (new Set(columns).size !== columns.length) throw new Error('Duplicate CSV columns');
  const accountColumn = 'What email did you use to sign up for the Gal Tookit MAX?';
  for (const name of ['First Name', 'Last Name', 'Email', accountColumn]) {
    if (!columns.includes(name)) throw new Error(`Missing CSV column: ${name}`);
  }
  const seen = new Map();
  const participants = [];
  let duplicates = 0;
  rows.forEach((values, i) => {
    const line = i + 2;
    if (values.length !== columns.length) throw new Error(`CSV record ${line}: wrong number of fields`);
    const data = Object.fromEntries(columns.map((key, index) => [key, values[index].trim()]));
    const email = normalizeEmail(data.Email);
    const accountEmail = normalizeEmail(data[accountColumn] || data.Email);
    if (!validEmail(email) || !validEmail(accountEmail)) throw new Error(`CSV record ${line}: invalid email`);
    const participant = { line, email, accountEmail, firstName: data['First Name'], lastName: data['Last Name'] };
    const previous = seen.get(accountEmail) || seen.get(email);
    if (previous) {
      const equal = ['email', 'accountEmail', 'firstName', 'lastName'].every(key => previous[key] === participant[key]);
      if (!equal) throw new Error(`CSV records ${previous.line} and ${line}: conflicting duplicate email`);
      duplicates++;
      return;
    }
    seen.set(email, participant); seen.set(accountEmail, participant);
    participants.push(participant);
  });
  if (!participants.length) throw new Error('CSV contains no participants');
  return { participants, duplicates, records: rows.length };
}

export function sqlDate(value) {
  return value.toISOString().slice(0, 19).replace('T', ' ');
}

export function asDate(value) {
  if (value == null || value === '') return null;
  const source = String(value).replace(' ', 'T');
  const date = value instanceof Date ? value : new Date(/[zZ]$|[+-]\d{2}:\d{2}$/.test(source) ? source : `${source}Z`);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid subscription date');
  return date;
}

export function addYear(date) {
  const next = new Date(date);
  const month = next.getUTCMonth();
  next.setUTCFullYear(next.getUTCFullYear() + 1);
  // February 29 becomes February 28, preserving a calendar year.
  if (next.getUTCMonth() !== month) next.setUTCDate(0);
  return next;
}

export function accessDecision(subscriptions, now) {
  let base = new Date(now);
  for (const row of subscriptions) {
    if (![1, -1].includes(Number(row.status))) continue;
    const dates = [asDate(row.ends_at), asDate(row.paddle_billing_period_ends_at)].filter(Boolean);
    if (Number(row.status) === 1 && (row.plan === 'lifetime' || !dates.length)) {
      return { action: 'keep_lifetime', expiresAt: null, baseAt: null };
    }
    for (const date of dates) if (date > base) base = date;
  }
  return { action: base > now ? 'extend_access' : 'grant_access', baseAt: sqlDate(base), expiresAt: sqlDate(addYear(base)) };
}

export function campaignSubscriptionId(campaign, email) {
  return `admin_course_${createHash('sha256').update(`${campaign}\0${email}`).digest('hex').slice(0, 40)}`;
}

const htmlEscape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const VARIABLES = new Set(['first_name', 'last_name', 'email', 'account_email', 'expires_at', 'login_url', 'setup_password_url', 'access_url', 'access_label', 'account_instructions', 'access_summary']);

export function validateTemplate(template) {
  if (!template || typeof template !== 'object' || typeof template.subject !== 'string' || !template.subject.trim() ||
      typeof template.text !== 'string' || !template.text.trim() || typeof template.html !== 'string' || !template.html.trim()) {
    throw new Error('Template JSON must contain non-empty subject, text and html strings');
  }
  for (const key of ['subject', 'text', 'html']) {
    for (const match of template[key].matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
      if (!VARIABLES.has(match[1])) throw new Error(`Unknown email variable: ${match[1]}`);
      if (key === 'subject' && ['setup_password_url', 'access_url'].includes(match[1])) throw new Error('Password link cannot be used in subject');
    }
  }
  return template;
}

export function renderEmail(template, values) {
  validateTemplate(template);
  const replace = (source, html) => source.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, key) => {
    const value = values[key] ?? '';
    return html ? htmlEscape(value) : String(value);
  });
  const result = { subject: replace(template.subject, false), text: replace(template.text, false), html: replace(template.html, true) };
  // A newly created account must receive a usable password setup link in this same email.
  if (values.setup_password_url) {
    const includesSetup = source => /\{\{\s*setup_password_url\s*\}\}/.test(source) ||
      (values.access_url === values.setup_password_url && /\{\{\s*access_url\s*\}\}/.test(source));
    if (!includesSetup(template.text)) result.text += `\n\nSet your password (link valid for 7 days): ${values.setup_password_url}`;
    if (!includesSetup(template.html)) result.html += `<p><a href="${htmlEscape(values.setup_password_url)}">Set your password</a> (link valid for 7 days)</p>`;
  }
  return result;
}

export function selectEmailTemplate(grant, template, extensionTemplate) {
  return extensionTemplate && !Number(grant.created_user) && grant.action === 'extend_access' && grant.expires_at
    ? extensionTemplate : template;
}

export function mailValues(grant, siteOrigin, setupUrl = '') {
  const loginUrl = `${siteOrigin}/`;
  const accessSummary = grant.expires_at
    ? `Your Gal Toolkit MAX access is available through ${new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(asDate(grant.expires_at))}.`
    : 'Your existing lifetime access to Gal Toolkit MAX remains active.';
  return {
    first_name: grant.first_name, last_name: grant.last_name, email: grant.contact_email,
    account_email: grant.account_email, expires_at: grant.expires_at || 'Lifetime',
    login_url: loginUrl, setup_password_url: setupUrl,
    access_url: setupUrl || loginUrl,
    access_label: setupUrl ? 'Set your password' : 'Open Gal Toolkit MAX',
    account_instructions: setupUrl
      ? 'We have created your account for you. Click below to choose your password, then sign in with the email address above. Your personal password setup link is valid for 7 days. If it expires, use Forgot password on the website to request a new link.'
      : 'Your access has been added to your existing account. Click below and sign in with the email address above using your usual password or Continue with Google, if that is how you normally sign in.',
    access_summary: accessSummary,
  };
}

export function retryIsSafe(startedAt, now) {
  // Leave an hour of margin inside Resend's 24-hour deduplication window.
  return now.getTime() - asDate(startedAt).getTime() < 23 * 60 * 60 * 1000;
}
