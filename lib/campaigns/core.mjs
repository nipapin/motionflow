import { createHash } from 'node:crypto';
import { parseCsv, asDate, sqlDate } from '../../scripts/lib/premieregal-course.mjs';

export { asDate, sqlDate };
export const VARIABLES = ['first_name', 'last_name', 'email', 'account_email', 'expires_at', 'login_url', 'setup_password_url', 'access_url', 'access_label', 'account_instructions', 'access_summary', 'product_name', 'duration', 'starts_at'];
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

export function addDuration(date, duration) {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  if (duration === 'month') result.setUTCMonth(result.getUTCMonth() + 1);
  else if (duration === 'year') result.setUTCFullYear(result.getUTCFullYear() + 1);
  else if (duration === 'unlimited') return null;
  else throw new Error('Unknown access duration');
  const last = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, last));
  return result;
}

export function parseRecipients(source) {
  const rows = parseCsv(source);
  if (!rows.length) throw new Error('Recipient list is empty');
  const header = rows[0].map(v => v.trim().toLowerCase().replace(/[_-]/g, ' '));
  const emailColumn = header.findIndex(v => ['email','email address','почта'].includes(v));
  const hasHeader = emailColumn >= 0;
  if (hasHeader && new Set(header).size !== header.length) throw new Error('Duplicate CSV columns');
  const firstColumn = header.findIndex(v => ['first name','name','имя'].includes(v));
  const lastColumn = header.findIndex(v => ['last name','фамилия'].includes(v));
  const accountColumn = header.findIndex(v => ['account email','what email did you use to sign up for the gal tookit max?'].includes(v));
  const seen = new Map();
  let duplicates = 0;
  for (const [index, row] of (hasHeader ? rows.slice(1) : rows).entries()) {
    if ((!hasHeader && row.length !== 1) || (hasHeader && row.length !== header.length)) throw new Error('Use one email per line, or a CSV with an Email header and matching columns');
    const email = (row[hasHeader ? emailColumn : 0] || '').trim().toLowerCase();
    const accountEmail = (hasHeader && accountColumn >= 0 ? row[accountColumn] : '')?.trim().toLowerCase() || email;
    for (const value of [email, accountEmail]) if (value.length > 255 || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value)) throw new Error(`Invalid email on row ${index + (hasHeader ? 2 : 1)}`);
    const recipient = {email, account_email: accountEmail, first_name: hasHeader && firstColumn >= 0 ? (row[firstColumn] || '').trim() : '', last_name: hasHeader && lastColumn >= 0 ? (row[lastColumn] || '').trim() : ''};
    if (recipient.first_name.length > 255 || recipient.last_name.length > 255) throw new Error('Recipient name is too long');
    const prior = seen.get(accountEmail);
    if (prior) {
      if (JSON.stringify(prior) !== JSON.stringify(recipient)) throw new Error(`Conflicting duplicate account: ${accountEmail}`);
      duplicates++;
    } else seen.set(accountEmail, recipient);
  }
  if (!seen.size) throw new Error('Recipient list is empty');
  if (seen.size > 5000) throw new Error('A campaign supports up to 5,000 recipients');
  return {recipients:[...seen.values()],duplicates};
}

export function validateTemplate(template) {
  for (const field of ['subject','text','html']) {
    if (typeof template?.[field] !== 'string' || !template[field].trim()) throw new Error('Each template needs subject, text and HTML');
    if (template[field].length > (field === 'subject' ? 250 : 250000)) throw new Error('Email template is too large');
    for (const match of template[field].matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
      if (!VARIABLES.includes(match[1])) throw new Error(`Unknown email variable: ${match[1]}`);
      if (field === 'subject' && ['setup_password_url','access_url'].includes(match[1])) throw new Error('Personal links cannot appear in the subject');
    }
  }
  return template;
}

export function assertSendable(email) {
  if (['subject','text','html'].some(key => /\b(?:PREVIEW_ONLY|TEST_?PREVIEW)\b/i.test(email[key]) || /\{\{[^{}]+\}\}/.test(email[key]))) throw new Error('Preview tokens or unresolved variables: sending blocked');
}

export function renderCampaignEmail(campaign, recipient, setupUrl = '') {
  const selected = recipient.action === 'extend_access' && campaign.extension_template ? campaign.extension_template : campaign.template;
  validateTemplate(selected);
  const product = campaign.product_name || 'Motion Flow';
  const format = value => value ? new Intl.DateTimeFormat('en-US', {year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}).format(asDate(value)) : 'Unlimited';
  const site = campaign.site_origin.replace(/\/$/, '');
  const values = {
    first_name:recipient.first_name || 'there', last_name:recipient.last_name || '', email:recipient.email,
    account_email:recipient.account_email, expires_at:format(recipient.expires_at), starts_at:format(recipient.base_at),
    product_name:product, duration:campaign.grant.duration === 'month' ? 'one month' : campaign.grant.duration === 'year' ? 'one year' : 'unlimited access',
    login_url:`${site}/`, setup_password_url:setupUrl, access_url:setupUrl || `${site}/`,
    access_label:setupUrl ? 'Set your password' : `Open ${product}`,
    account_instructions:setupUrl ? 'We have created your account for you. Set your password using the button below, then sign in with the email address above. This personal link is valid for 7 days. If it expires, use Forgot password on the website.' : 'Sign in to your existing account using your usual password or Continue with Google, if that is how you normally sign in.',
    access_summary:campaign.grant.kind === 'invite' ? 'Your account is ready.' : recipient.expires_at ? `Your ${product} access is available through ${format(recipient.expires_at)}.` : `Your ${product} access has no expiration date.`,
  };
  const replace = (input, html) => input.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, key) => html ? escapeHtml(values[key] || '') : values[key] || '');
  const result = {subject:replace(selected.subject,false),text:replace(selected.text,false),html:replace(selected.html,true)};
  if (setupUrl) {
    for (const key of ['text','html']) if (!/\{\{\s*(setup_password_url|access_url)\s*\}\}/.test(selected[key])) {
      if (key === 'text') result.text += `\n\nSet your password (valid for 7 days): ${setupUrl}`;
      else result.html = result.html.replace(/<\/body>/i, `<p><a href="${escapeHtml(setupUrl)}">Set your password</a> (valid for 7 days)</p></body>`);
      if (key === 'html' && !result.html.includes(escapeHtml(setupUrl))) result.html += `<p><a href="${escapeHtml(setupUrl)}">Set your password</a> (valid for 7 days)</p>`;
    }
  }
  return result;
}

export function stableId(campaignId, email) {
  return `campaign_${createHash('sha256').update(`${campaignId}\0${email}`).digest('hex').slice(0,40)}`;
}

export function subscriptionScope(rows, catalog) {
  return rows.filter(row => !(catalog.excludedPriceIds || []).includes(row.paddle_price_id) && (catalog.authorId == null ? row.author_id == null || ![4141,1691].includes(Number(row.author_id)) : Number(row.author_id) === catalog.authorId));
}

export function accessPlan(rows, duration, now = new Date()) {
  let base = new Date(now);
  for (const row of rows) {
    if (![1,-1].includes(Number(row.status))) continue;
    const dates = [asDate(row.ends_at),asDate(row.paddle_billing_period_ends_at)].filter(Boolean);
    if (Number(row.status) === 1 && (row.plan === 'lifetime' || !dates.length)) return {action:'keep_existing',base_at:null,expires_at:null};
    for (const date of dates) if (date > base) base = date;
  }
  return {action:base > now ? 'extend_access' : 'grant_access',base_at:sqlDate(base),expires_at:duration === 'unlimited' ? null : sqlDate(addDuration(base,duration))};
}

export function paddleFingerprint(sub) {
  return createHash('sha256').update(JSON.stringify({customer:sub.customer_id,buyer:sub.custom_data?.buyer_id ?? sub.custom_data?.userId,collection:sub.collection_mode,currency:sub.currency_code,cycle:sub.billing_cycle,status:sub.status,items:(sub.items || []).map(i => [i.price?.id,i.quantity,i.recurring]).sort()})).digest('hex');
}

export function paddlePlan(row, sub, catalog, duration, now = new Date()) {
  if (sub.id !== row.subscription_id) throw new Error('Paddle subscription identity mismatch');
  const buyer = sub.custom_data?.buyer_id ?? sub.custom_data?.userId;
  if (buyer != null && Number(buyer) !== Number(row.buyer_id)) throw new Error('Paddle subscription belongs to another user');
  const recurring = (sub.items || []).filter(i => i.recurring !== false && i.price?.billing_cycle);
  if (!recurring.length || recurring.some(i => !catalog.allPriceIds.includes(i.price.id))) throw new Error('Unknown or mixed Paddle subscription products');
  if (['canceled','paused'].includes(sub.status)) return null;
  if (sub.status !== 'active') throw new Error('Paddle subscription must be active; trial, debt or other status needs manual review');
  if (duration === 'unlimited') throw new Error('An unlimited grant cannot automatically postpone a recurring subscription indefinitely');
  if (sub.scheduled_change) throw new Error('Paddle has a scheduled change; resolve it before launching');
  const end = asDate(sub.current_billing_period?.ends_at);
  if (!end || !sub.next_billed_at || asDate(sub.next_billed_at).getTime() !== end.getTime()) throw new Error('Paddle period end and next billing date do not match');
  if (end.getTime() - now.getTime() <= 1800000) throw new Error('Paddle renewal is within 30 minutes');
  return {id:sub.id,row_id:row.id,previous:end.toISOString(),target:addDuration(end,duration).toISOString(),fingerprint:paddleFingerprint(sub),environment:catalog.environment,account:catalog.account,state:'prepared'};
}

export function billingRecovery(plan, sub, catalog, now = new Date()) {
  if (catalog.environment !== plan.environment || catalog.account !== plan.account) throw new Error('Paddle environment changed since preparation');
  if (sub.id !== plan.id || paddleFingerprint(sub) !== plan.fingerprint || sub.scheduled_change) throw new Error('Paddle subscription changed since preparation');
  const next = asDate(sub.next_billed_at);
  if (next && next.getTime() === asDate(plan.target).getTime()) return 'synced';
  if (plan.state === 'applied') throw new Error('Completed Paddle renewal changed; review manually');
  if (!next || next.getTime() !== asDate(plan.previous).getTime() || asDate(sub.current_billing_period?.ends_at)?.getTime() !== next.getTime()) throw new Error('Unexpected Paddle billing date; no second extension was applied');
  if (next.getTime() - now.getTime() <= 1800000) throw new Error('Paddle renewal is within 30 minutes');
  return 'move';
}

/** Campaign purchases expire without a cleanup job. Legacy purchases are unaffected. */
export function soldItemAccessCondition(alias = '') {
  if (alias && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias)) throw new Error('Invalid SQL alias');
  const p = alias ? `${alias}.` : '';
  return `${p}status = 1 AND (CASE WHEN ${p}\`system\` = 'campaign' THEN CASE WHEN JSON_VALID(${p}arguments) THEN CASE WHEN JSON_EXTRACT(${p}arguments, '$.access_expires_at') IS NULL OR JSON_TYPE(JSON_EXTRACT(${p}arguments, '$.access_expires_at')) = 'NULL' THEN 1 ELSE CAST(JSON_UNQUOTE(JSON_EXTRACT(${p}arguments, '$.access_expires_at')) AS DATETIME) > UTC_TIMESTAMP() END ELSE 0 END ELSE 1 END) = 1`;
}
