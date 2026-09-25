/**
 * Pace a Mailgun campaign: small batches with o:deliverytime,
 * so Gmail does not see 20k messages in one minute.
 *
 *   node scripts/send-campaign-queued.mjs
 *
 * Skips the first FLOW10 burst (same 20k query). Remaining opted-in
 * users are scheduled across the next ~2 days.
 */
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stateDir = join(root, ".campaigns");
const statePath = join(stateDir, "flow10-queue-state.json");

const BATCH_SIZE = 60;
const SLOT_MINUTES = 10;
const FIRST_SLOT_DELAY_MIN = 20;
const MAILGUN_MAX_HOURS = 23;

const GAL_WHERE = `
  LOWER(email) LIKE '%premieregal%'
  OR LOWER(email) LIKE '%premiere-gal%'
  OR LOWER(email) LIKE '%premiere_gal%'
  OR LOWER(email) LIKE '%galtoolkit%'
  OR LOWER(email) LIKE '%gal-toolkit%'
  OR LOWER(name) LIKE '%premieregal%'
  OR LOWER(name) LIKE '%premiere gal%'
  OR LOWER(name) LIKE '%galtoolkit%'
  OR LOWER(name) LIKE '%gal toolkit%'
`;

function loadEnv() {
  const env = Object.fromEntries(
    readFileSync(join(root, ".env"), "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const i = line.indexOf("=");
        const key = line.slice(0, i).trim();
        let value = line.slice(i + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        return [key, value];
      }),
  );
  return env;
}

function rfc2822(date) {
  return date.toUTCString();
}

function form(entries) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

function loadState() {
  try {
    return JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    return { burstEmails: [], queuedEmails: [], slots: [] };
  }
}

function saveState(state) {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

async function mg(env, path, body) {
  const endpoint = (env.MAILGUN_ENDPOINT || "api.mailgun.net").replace(/^https?:\/\//, "");
  const auth = `Basic ${Buffer.from(`api:${env.MAILGUN_SECRET}`).toString("base64")}`;
  const res = await fetch(`https://${endpoint}${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: auth },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Mailgun ${res.status} ${path}: ${JSON.stringify(json).slice(0, 500)}`);
  }
  return json;
}

const env = loadEnv();
const html = readFileSync(join(root, "docs/email-campaigns/flow10-welcome.html"), "utf8");
const subject = "One space for the whole edit — 10% off with FLOW10";
const from = `Motion Flow <hello@${env.MAILGUN_DOMAIN}>`;
const domain = env.MAILGUN_DOMAIN;

const conn = await mysql.createConnection({
  host: env.DB_HOST,
  port: Number(env.DB_PORT || 3306),
  user: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
});

const [allEligible] = await conn.query(`
  SELECT email, name, created_at, id
  FROM users
  WHERE mailing = 0
    AND email IS NOT NULL
    AND TRIM(email) <> ''
    AND NOT (${GAL_WHERE})
  ORDER BY created_at DESC, id DESC
`);
await conn.end();

const burst = allEligible.slice(0, 20000);
const remaining = allEligible.slice(20000);
const state = loadState();
state.burstEmails = burst.map((row) => String(row.email).trim().toLowerCase());
const alreadyQueued = new Set(
  (state.queuedEmails || []).map((email) => email.toLowerCase()),
);

const toQueue = remaining.filter((row) => {
  const email = String(row.email).trim().toLowerCase();
  return email && !alreadyQueued.has(email);
});

const maxSlots = Math.floor((MAILGUN_MAX_HOURS * 60 - FIRST_SLOT_DELAY_MIN) / SLOT_MINUTES);
const capacity = maxSlots * BATCH_SIZE;
const work = toQueue.slice(0, capacity);

console.log(
  JSON.stringify({
    eligible: allEligible.length,
    burstSkipped: burst.length,
    remaining: remaining.length,
    alreadyQueued: alreadyQueued.size,
    willSchedule: work.length,
    batchSize: BATCH_SIZE,
    slotMinutes: SLOT_MINUTES,
  }),
);

const now = Date.now();
let scheduled = 0;

for (let i = 0; i < work.length; i += BATCH_SIZE) {
  const chunk = work.slice(i, i + BATCH_SIZE);
  const slotIndex = Math.floor(i / BATCH_SIZE);
  const when = new Date(now + (FIRST_SLOT_DELAY_MIN + slotIndex * SLOT_MINUTES) * 60 * 1000);
  const vars = {};
  const f = form({
    from,
    subject,
    html,
    "o:tracking": "yes",
    "o:tracking-clicks": "yes",
    "o:tracking-opens": "yes",
    "o:tag": "flow10-welcome-queued",
    "o:deliverytime": rfc2822(when),
  });
  for (const row of chunk) {
    const email = String(row.email).trim();
    f.append("to", email);
    vars[email] = { name: row.name ? String(row.name) : "" };
  }
  f.append("recipient-variables", JSON.stringify(vars));

  const sent = await mg(env, `/v3/${domain}/messages`, f);
  scheduled += chunk.length;
  for (const row of chunk) alreadyQueued.add(String(row.email).trim().toLowerCase());
  state.queuedEmails = [...alreadyQueued];
  state.slots.push({
    at: when.toISOString(),
    count: chunk.length,
    id: sent.id,
  });
  saveState(state);
  console.log(JSON.stringify({ scheduled, nextAt: when.toISOString(), id: sent.id }));
}

state.queuedEmails = [...alreadyQueued];
saveState(state);
console.log(JSON.stringify({ done: true, scheduled, firstSlot: state.slots[0]?.at, lastSlot: state.slots.at(-1)?.at }));
