import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { createAccounting } from '../lib/paddle-accounting/engine.mjs';
import { accountingCatalog } from '../lib/paddle-accounting/catalog.mjs';

try { process.loadEnvFile('.env'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const command = process.argv[2] ?? 'status';
const allowed = ['schema', 'status', 'enable', 'disable', 'retry'];
if (!allowed.includes(command)) throw new Error(`Use: ${allowed.join('|')}`);
const pool = mysql.createPool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE,
  connectionLimit: 2, dateStrings: true });
const accounting = createAccounting({ getConnection: () => pool.getConnection(), catalog: accountingCatalog,
  marketTable: process.env.DB_MARKET_ITEMS_TABLE ?? 'marketplace_items' });
async function paddle(account, environment, path) {
  const configured = (account === 'spunkram' ? process.env.NEXT_PUBLIC_SPUNKRAM_PADDLE_ENVIRONMENT : process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT) ?? 'sandbox';
  if (configured !== environment) throw new Error('Stored Paddle environment differs from configured API key');
  const key = account === 'spunkram' ? process.env.SPUNKRAM_PADDLE_API_KEY : process.env.PADDLE_API_KEY;
  const base = environment === 'production' ? 'https://api.paddle.com' : 'https://sandbox-api.paddle.com';
  const url = new URL(path, base);
  if (url.origin !== base) throw new Error('Unexpected Paddle pagination host');
  const response = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Paddle read failed: ${response.status}`);
  return response.json();
}

try {
  if (command === 'schema') {
    const sql = await fs.readFile(new URL('../db/migrations/2026_10_21_paddle_actual_accounting.sql', import.meta.url), 'utf8');
    // No multi-statements connection permission, no historical backfill.
    for (const statement of sql.split(';').map(s => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean)) await pool.query(statement);
    console.log('Additive journal schema ready. Accounting is not activated.');
  } else if (command === 'enable') {
    if (accountingCatalog().corePriceIds.length !== 4) throw new Error('Configure all four Creator / Creator AI Price IDs before enabling');
    const required = ['users','sold_items','subscription_systems','subscription_payments','paddle_accounting_settings',
      'paddle_accounting_transactions','paddle_accounting_lines','paddle_accounting_adjustments','paddle_accounting_movements'];
    const [engines] = await pool.query(`SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (${required.map(()=>'?').join(',')})`,required);
    if (engines.length !== required.length || engines.some(t=>t.ENGINE!=='InnoDB')) throw new Error('Every financial table must exist and use InnoDB');
    const [worker] = await pool.query('SELECT worker_heartbeat_at, TIMESTAMPDIFF(SECOND,worker_heartbeat_at,UTC_TIMESTAMP()) AS age FROM paddle_accounting_settings WHERE id=1');
    if (!worker[0]?.worker_heartbeat_at || Number(worker[0].age) > 180) throw new Error('Start the accounting worker and wait for its first successful pass before enabling');
    // Never backdate or replace an already-established boundary.
    await pool.execute('UPDATE paddle_accounting_settings SET enabled_from=COALESCE(enabled_from,UTC_TIMESTAMP(6)),accept_new=1 WHERE id=1');
    console.log('New eligible transactions enabled; Creator / Creator AI remain excluded.');
  } else if (command === 'disable') {
    await pool.execute('UPDATE paddle_accounting_settings SET accept_new=0 WHERE id=1');
    console.log('New ownership disabled. Existing v2 payments still use their journal.');
  } else if (command === 'retry') {
    const [settings] = await pool.query('SELECT * FROM paddle_accounting_settings WHERE id=1');
    const boundary = settings[0]?.enabled_from;
    const guard = await pool.getConnection();
    const [lock] = await guard.query("SELECT GET_LOCK('paddle_accounting_reconcile_v2',0) AS acquired");
    if (lock[0].acquired !== 1) { guard.release(); throw new Error('Another reconciliation is running'); }
    try {
    const [pending] = await pool.query("SELECT * FROM paddle_accounting_transactions WHERE status='pending' ORDER BY updated_at,id LIMIT 100");
    for (const row of pending) {
      try {
        const { data } = await paddle(row.account, row.environment, `/transactions/${row.transaction_id}`);
        const result = await accounting.transaction(data, row);
        console.log(row.transaction_id, result.status, result.reason ?? '');
      } catch (error) { console.error(row.transaction_id, error.message); process.exitCode = 1; }
    }
    // Read Paddle's new payments as well as durable pending records. This
    // recovers a missing webhook without revisiting historical financial rows.
    for (const account of ['default', 'spunkram']) {
      const environment = (account === 'spunkram' ? process.env.NEXT_PUBLIC_SPUNKRAM_PADDLE_ENVIRONMENT : process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT) ?? 'sandbox';
      const key = account === 'spunkram' ? process.env.SPUNKRAM_PADDLE_API_KEY : process.env.PADDLE_API_KEY;
      if (!boundary || !key) continue;
      try {
        const cutoff = new Date(boundary.replace(' ', 'T') + 'Z').getTime();
        const transactions = [], adjustments = [], cache = new Map();
        for (const [path, collected] of [['/transactions?status=completed&per_page=30&order_by=created_at%5BDESC%5D', transactions], ['/adjustments?per_page=50', adjustments]]) {
          let next = path;
          while (next) {
            const response = await paddle(account, environment, next);
            const recent = response.data.filter(r => new Date(r.created_at).getTime() >= cutoff);
            collected.push(...recent);
            next = recent.length === response.data.length && response.meta?.pagination?.has_more ? response.meta.pagination.next : null;
          }
        }
        const source = { account, environment };
        for (const txn of transactions.sort((a, b) => a.created_at.localeCompare(b.created_at))) {
          cache.set(txn.id, txn);
          // Disabling stops ownership of new charges; already-owned rows still
          // settle through the same journal and never fall back to estimates.
          await accounting.transaction(txn, source);
        }
        for (const adj of adjustments.sort((a, b) => a.created_at.localeCompare(b.created_at))) {
          const [owned] = await pool.execute('SELECT id FROM paddle_accounting_transactions WHERE account=? AND environment=? AND transaction_id=?', [account,environment,adj.transaction_id]);
          if (!owned.length) continue;
          let txn = cache.get(adj.transaction_id);
          if (!txn) { txn = (await paddle(account,environment,`/transactions/${adj.transaction_id}`)).data; cache.set(txn.id,txn); }
          await accounting.adjustment(adj,txn,source);
        }
      } catch (error) { console.error(account, error.message); process.exitCode = 1; }
    }
    if (!process.exitCode) await pool.query('UPDATE paddle_accounting_settings SET worker_heartbeat_at=UTC_TIMESTAMP(6) WHERE id=1');
    } finally {
      await guard.query("SELECT RELEASE_LOCK('paddle_accounting_reconcile_v2')"); guard.release();
    }
  }
  const [settings] = await pool.query('SELECT * FROM paddle_accounting_settings WHERE id=1');
  const [counts] = await pool.query('SELECT status,COUNT(*) AS count FROM paddle_accounting_transactions GROUP BY status');
  const [adjustments] = await pool.query('SELECT status,COUNT(*) AS count FROM paddle_accounting_adjustments GROUP BY status');
  console.log(JSON.stringify({ settings, transactions: counts, adjustments }, null, 2));
} finally { await pool.end(); }
