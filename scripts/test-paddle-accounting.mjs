import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import path from 'node:path';
import { allocate, bps, major, moneyFromAdjustment, moneyFromPaddle, percent, split } from '../lib/paddle-accounting/money.mjs';
import { createAccounting } from '../lib/paddle-accounting/engine.mjs';
import { accountingCatalog } from '../lib/paddle-accounting/catalog.mjs';

const source = { account: 'default', environment: 'production' };
const laravelFile = file => process.env.PADDLE_ACCOUNTING_LARAVEL_ROOT
  ? path.join(process.env.PADDLE_ACCOUNTING_LARAVEL_ROOT,file) : new URL('../Laravel/'+file,import.meta.url);
const rule = { kind: 'sale', authorId: 11, siteBps: 1000, coAuthorId: 12, coBps: 5000 };
function sale(overrides = {}) {
  return { id: 'txn_test', status: 'completed', created_at: '2030-01-02T12:00:00Z', billed_at: '2030-01-02T12:01:00Z',
    currency_code: 'USD', custom_data: { buyer_id: 1 },
    items: [{ price: { id: 'pri_sale', custom_data: { license: 1 } } }],
    details: { totals: { subtotal: '7500', discount: '0', tax: '1500', total: '9000' },
      payout_totals: { currency_code: 'USD', fee: '500', earnings: '7000', discount: '0' },
      line_items: [{ id: 'txnitm_sale', price_id: 'pri_sale', quantity: 1, product: { custom_data: { item_id: 101 } },
        totals: { subtotal: '7500', discount: '0', tax: '1500', total: '9000' } }] }, ...overrides };
}
function refund(txn, { id = 'adj_refund', earnings = '7000', retained = '500', status = 'approved', taxOnly = false, type = 'full' } = {}) {
  const fee = taxOnly ? -Number(earnings) : Number(retained);
  const subtotal = taxOnly ? 0 : Number(earnings)+fee;
  return { id, transaction_id: txn.id, action: 'refund', status, type,
    payout_totals: { currency_code: 'USD', earnings, fee:String(fee), retained_fee: retained },
    items: [{ item_id: txn.details.line_items[0].id, type: taxOnly ? 'tax' : type,
      totals: { subtotal: String(subtotal), tax: taxOnly ? '1500' : '0', total:String(subtotal+(taxOnly?1500:0)) } }] };
}

test('mixed refund: tax-only item receives its returned fee rather than losing income',()=>{
  const amounts=moneyFromAdjustment({payout_totals:{currency_code:'USD',fee:'100',earnings:'900',retained_fee:'0'},items:[
    {item_id:'normal',totals:{subtotal:'1000',tax:'0',total:'1000'}},
    {item_id:'tax',totals:{subtotal:'0',tax:'100',total:'100'}},
  ]});
  assert.deepEqual(amounts,[{id:'normal',earnings:909,retained:0},{id:'tax',earnings:-9,retained:0}]);
});

test('Paddle VAT, zero fee and discount: use final net, never deduct tax twice', () => {
  assert.deepEqual(moneyFromPaddle(sale()), [{ id: 'txnitm_sale', revenue: 7500, fee: 500, net: 7000 }]);
  const t = sale(); t.details.payout_totals.fee = '0'; t.details.payout_totals.earnings = '7500';
  assert.equal(moneyFromPaddle(t)[0].fee, 0);
  t.details.totals.discount = t.details.line_items[0].totals.discount = '3750';
  t.details.payout_totals.earnings = '3750'; t.details.payout_totals.discount = '3750';
  assert.equal(moneyFromPaddle(t)[0].net, 3750);
});
test('foreign checkout currency is allocated in the payout currency', () => {
  const t = sale({ currency_code: 'EUR' }); t.details.payout_totals.earnings = '8250'; t.details.payout_totals.fee = '550';
  assert.deepEqual(moneyFromPaddle(t)[0], { id: 'txnitm_sale', revenue: 8800, fee: 550, net: 8250 });
});
test('fee allocated once per order, quantity totals and stable cent remainder', () => {
  const t = sale(); t.details.line_items = [
    { id: 'b', quantity: 2, totals: { subtotal: '2000', discount: '0', total: '2000' } },
    { id: 'a', quantity: 1, totals: { subtotal: '1000', discount: '0', total: '1000' } },
  ]; t.details.totals = { subtotal: '3000', discount: '0' }; t.details.payout_totals = { fee: '200', earnings: '2800', currency_code: 'USD' };
  const result = moneyFromPaddle(t);
  assert.equal(result.reduce((a, b) => a + b.fee, 0), 200);
  assert.equal(result.reduce((a, b) => a + b.net, 0), 2800);
  assert.deepEqual(result.map(r => r.fee), [133, 67]);
  assert.deepEqual(allocate(1, [{ id: 'b', weight: 1 }, { id: 'a', weight: 1 }]), [0, 1]);
});
test('rounding conserves cents for large and signed amounts', () => {
  assert.equal(percent(2705, 5000), 1353); assert.equal(major(-1), '-0.01'); assert.equal(bps('12.25'), 1225);
  assert.deepEqual(split(7000,{kind:'subscription',authorId:11,siteBps:1000,authorBps:4500}),{'author:11':3150,'site_fee:0':700,'platform:0':3150});
  for (const total of [0, 1, -1, 937, -937, 1234567890123]) {
    assert.equal(allocate(total, [{ id: 'x', weight: 1 }, { id: 'y', weight: 2 }, { id: 'z', weight: 3 }]).reduce((a, b) => a + b, 0), total);
  }
  for (let net = 0; net < 1000; net++) {
    for (const r of [rule, { ...rule, refAuthorId: 13, refBps: 500 }, { kind: 'subscription', authorId: 11 }]) {
      assert.equal(Object.values(split(net, r)).reduce((a, b) => a + b, 0), net);
    }
  }
});
test('missing final data, invalid minor amounts and non-USD payouts never estimate a fee', () => {
  for (const change of [t => t.status = 'paid', t => t.details.payout_totals.fee = null,
    t => t.details.payout_totals.currency_code = 'EUR', t => t.details.line_items[0].totals.subtotal = '1.5']) {
    const t = sale(); change(t); assert.throws(() => moneyFromPaddle(t));
  }
});

const integration = process.env.PADDLE_ACCOUNTING_TEST_MYSQL === '1';
async function fixture() {
  try { process.loadEnvFile('.env'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const mysql = await import('mysql2/promise');
  const conn = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE, dateStrings: true });
  // Every name the engine can mutate is shadowed by a session-local TEMPORARY
  // table, including the existing application tables. No persistent DDL/data.
  const ddl = await fs.readFile(new URL('../db/migrations/2026_10_21_paddle_actual_accounting.sql', import.meta.url), 'utf8');
  for (const sql of ddl.split(';').map(s => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean)) await conn.query(sql.replace('CREATE TABLE IF NOT EXISTS', 'CREATE TEMPORARY TABLE'));
  const tables = {
    users: 'id INT PRIMARY KEY,balance DECIMAL(20,2) NOT NULL DEFAULT 0,extra_tax DECIMAL(5,2) NULL',
    marketplace_items: 'id INT PRIMARY KEY,author_id INT,team JSON',
    sold_items: `id BIGINT AUTO_INCREMENT PRIMARY KEY,buyer_id INT,author_id INT,item_id INT,status INT,payment_id VARCHAR(191),purchase_code VARCHAR(64),
      sold_price DECIMAL(20,2),sold_summary INT,sold_net DECIMAL(20,2),platform_earn DECIMAL(20,2),author_earn DECIMAL(20,2),
      license INT,qty INT,\`system\` VARCHAR(20),system_tax DECIMAL(20,2),arguments VARCHAR(191),co_author_id INT,co_percent DECIMAL(5,2),co_earn DECIMAL(20,2),
      ref_link_id INT,ref_author_id INT,ref_earn DECIMAL(20,2),co_ref_earn DECIMAL(20,2),created_at DATETIME,updated_at DATETIME`,
    subscription_systems: `id BIGINT AUTO_INCREMENT PRIMARY KEY,buyer_id INT,author_id INT,subscription_id VARCHAR(64) UNIQUE,payment_id VARCHAR(191),status INT,
      amount DECIMAL(20,2),amount_summary DECIMAL(20,2),price INT,system_tax DECIMAL(20,2),\`system\` VARCHAR(20),type VARCHAR(20),plan VARCHAR(20),\`count\` INT,
      arguments VARCHAR(191),ends_at DATETIME,paddle_product_id VARCHAR(64),paddle_price_id VARCHAR(64),paddle_product_name VARCHAR(100),
      paddle_billing_period_starts_at DATETIME,paddle_billing_period_ends_at DATETIME,author_earn DECIMAL(20,2),author_balance_credited_for_payment_id VARCHAR(64),created_at DATETIME,updated_at DATETIME`,
    subscription_payments: `id BIGINT AUTO_INCREMENT PRIMARY KEY,subscription_system_id BIGINT,buyer_id INT,author_id INT,subscription_id VARCHAR(64),payment_id VARCHAR(191) UNIQUE,
      plan VARCHAR(20),type VARCHAR(20),amount DECIMAL(20,2),amount_summary DECIMAL(20,2),author_earn DECIMAL(20,2),system_tax DECIMAL(20,2),discount DECIMAL(20,2),period_number INT,created_at DATETIME,updated_at DATETIME`,
  };
  for (const [name, fields] of Object.entries(tables)) await conn.query(`CREATE TEMPORARY TABLE \`${name}\` (${fields}) ENGINE=InnoDB`);
  await conn.query("UPDATE paddle_accounting_settings SET enabled_from='2030-01-01',accept_new=1 WHERE id=1");
  await conn.query('INSERT INTO users (id,balance,extra_tax) VALUES (1,0,NULL),(11,0,10),(12,0,NULL),(13,0,NULL)');
  await conn.execute('INSERT INTO marketplace_items (id,author_id,team) VALUES (101,11,?)', [JSON.stringify({ co_author_id: 12, percent: 50 })]);
  const engine = createAccounting({ getConnection: async () => ({ execute: conn.execute.bind(conn), beginTransaction: conn.beginTransaction.bind(conn),
    commit: conn.commit.bind(conn), rollback: conn.rollback.bind(conn), release() {} }),
    catalog: () => ({ corePriceIds: ['pri_creator', 'pri_creator_ai'], authorPrices: { pri_author: { authorId: 11, plan: 'monthly' }, pri_lifetime: { authorId: 11, plan: 'lifetime' } } }) });
  const balances = async () => Object.fromEntries((await conn.query('SELECT id,balance FROM users'))[0].map(r => [r.id, r.balance]));
  return { conn, engine, balances, close: () => conn.end() };
}

test('MySQL: initial sale, repeated deliveries, full refund, retained fees and immutable history', { skip: !integration }, async () => {
  const f = await fixture();
  try {
    const t = sale(); const first = await f.engine.transaction(t, source);
    assert.equal(first.status, 'applied', first.reason);
    assert.deepEqual(await f.balances(), { 1: '0.00', 11: '31.50', 12: '31.50', 13: '0.00' });
    await Promise.all([f.engine.transaction(t, source), f.engine.transaction(t, source)]);
    assert.equal((await f.conn.query('SELECT COUNT(*) AS n FROM sold_items'))[0][0].n, 1);
    const a = refund(t);
    assert.equal((await f.engine.adjustment(a, t, source)).status, 'applied');
    await f.engine.adjustment(a, t, source);
    assert.equal((await f.balances())[11], '0.00');
    assert.equal((await f.balances())[12], '0.00');
    const [rows] = await f.conn.query('SELECT original_net_minor,current_net_minor,breakdown FROM paddle_accounting_lines');
    assert.equal(Number(rows[0].original_net_minor), 7000); assert.equal(Number(rows[0].current_net_minor), 0);
    assert.equal((typeof rows[0].breakdown === 'string' ? JSON.parse(rows[0].breakdown) : rows[0].breakdown)['platform:0'], -500);
    assert.equal((await f.conn.query('SELECT status FROM sold_items'))[0][0].status, 0);
  } finally { await f.close(); }
});
test('MySQL: paid remains pending, final totals release exactly once, zero fee is final', { skip: !integration }, async () => {
  const f = await fixture();
  try {
    const t = sale({ status: 'paid' }); t.details.payout_totals = null;
    assert.equal((await f.engine.transaction(t, source)).status, 'pending');
    assert.equal((await f.balances())[11], '0.00');
    const final = sale(); final.details.payout_totals.fee = '0'; final.details.payout_totals.earnings = '7500';
    const applied = await f.engine.transaction(final, source); assert.equal(applied.status, 'applied', applied.reason);
    assert.equal((await f.balances())[11], '33.75');
  } finally { await f.close(); }
});
test('MySQL: Creator/Creator AI and historical transactions never enter the journal', { skip: !integration }, async () => {
  const f = await fixture();
  try {
    for (const price of ['pri_creator', 'pri_creator_ai']) {
      const t = sale(); t.items[0].price.id = t.details.line_items[0].price_id = price;
      assert.equal((await f.engine.transaction(t, source)).handled, false);
    }
    const old = sale({ created_at: '2029-12-31T23:59:59Z' });
    assert.equal((await f.engine.transaction(old, source)).handled, false);
    assert.equal((await f.engine.adjustment(refund(old), old, source)).handled, false);
    assert.equal((await f.conn.query('SELECT COUNT(*) AS n FROM paddle_accounting_transactions'))[0][0].n, 0);
    assert.equal((await f.balances())[11], '0.00');
  } finally { await f.close(); }
});
test('MySQL: pending approval, partial refunds, multiple refunds and tax-only positive correction', { skip: !integration }, async () => {
  const f = await fixture();
  try {
    const t = sale(); await f.engine.transaction(t, source);
    const a = refund(t, { earnings: '3500', retained: '250', status: 'pending_approval', type: 'partial' });
    await f.engine.adjustment(a, t, source); assert.equal((await f.balances())[11], '31.50');
    a.status = 'approved'; const r = await f.engine.adjustment(a, t, source); assert.equal(r.status, 'applied', r.reason);
    assert.equal((await f.balances())[11], '15.75');
    const b = refund(t, { id: 'adj_second', earnings: '3500', retained: '250', type: 'partial' });
    await f.engine.adjustment(b, t, source); assert.equal((await f.balances())[11], '0.00');
    const tax = refund(t, { id: 'adj_tax', earnings: '-302', retained: '0', taxOnly: true, type: 'partial' });
    assert.equal((await f.engine.adjustment(tax, t, source)).status, 'applied');
    assert.equal((await f.balances())[11], '1.36');
    assert.equal((await f.conn.query('SELECT status FROM sold_items'))[0][0].status,0);
  } finally { await f.close(); }
});
test('MySQL: multi-line sale, quantity and per-line rounding reconcile to Paddle', { skip: !integration }, async () => {
  const f = await fixture();
  try {
    const t = sale(); const second = structuredClone(t.details.line_items[0]); second.id = 'txnitm_second'; second.quantity = 2;
    t.details.line_items.push(second); t.details.totals.subtotal = '15000'; t.details.payout_totals.earnings = '14000'; t.details.payout_totals.fee = '1000';
    const result = await f.engine.transaction(t, source); assert.equal(result.status, 'applied', result.reason);
    assert.equal((await f.balances())[11], '63.00');
    assert.equal((await f.conn.query('SELECT SUM(amount_minor) AS n FROM paddle_accounting_movements'))[0][0].n, '14000');
  } finally { await f.close(); }
});
function subscription(paymentId, starts = '2030-01-02T12:00:00Z', lifetime = false) {
  const t = sale({ id: paymentId, subscription_id: lifetime ? null : 'sub_author', billing_period: lifetime ? null : { starts_at: starts, ends_at: '2030-03-02T12:00:00Z' } });
  t.items[0].price.id = t.details.line_items[0].price_id = lifetime ? 'pri_lifetime' : 'pri_author';
  t.details.line_items[0].product.custom_data = {};
  return t;
}
test('MySQL: renewal, late duplicate of first charge and refund of a prior period', { skip: !integration }, async () => {
  const f = await fixture();
  try {
    const first = subscription('txn_first'), renewal = subscription('txn_renewal', '2030-02-02T12:00:00Z');
    let result = await f.engine.transaction(first, source); assert.equal(result.status, 'applied', result.reason);
    result = await f.engine.transaction(renewal, source); assert.equal(result.status, 'applied', result.reason);
    await f.engine.transaction(first, source);
    assert.equal((await f.balances())[11], '63.00');
    assert.equal((await f.conn.query('SELECT COUNT(*) AS n FROM subscription_payments'))[0][0].n, 2);
    result = await f.engine.adjustment(refund(first), first, source); assert.equal(result.status, 'applied', result.reason);
    assert.equal((await f.balances())[11], '31.50');
    const [current] = await f.conn.query('SELECT status,payment_id,author_earn FROM subscription_systems');
    assert.equal(current[0].status, 1); assert.equal(current[0].payment_id, 'txn_renewal'); assert.equal(current[0].author_earn, '31.50');
  } finally { await f.close(); }
});
test('MySQL: Lifetime one-time charge and duplicate cannot double-credit', { skip: !integration }, async () => {
  const f = await fixture();
  try {
    const t = subscription('txn_lifetime', null, true);
    const r = await f.engine.transaction(t, source); assert.equal(r.status, 'applied', r.reason);
    await f.engine.transaction(t, source);
    assert.equal((await f.balances())[11], '31.50');
    assert.equal((await f.conn.query('SELECT plan,ends_at FROM subscription_systems'))[0][0].plan, 'lifetime');
  } finally { await f.close(); }
});
test('MySQL: failed beneficiary write rolls back projections, balances and journal atomically', { skip: !integration }, async () => {
  const f = await fixture();
  try {
    await f.conn.query('DELETE FROM users WHERE id=12');
    const r = await f.engine.transaction(sale(), source); assert.equal(r.status, 'pending');
    assert.equal((await f.balances())[11], '0.00');
    assert.equal((await f.conn.query('SELECT COUNT(*) AS n FROM sold_items'))[0][0].n, 0);
    assert.equal((await f.conn.query('SELECT COUNT(*) AS n FROM paddle_accounting_movements'))[0][0].n, 0);
  } finally { await f.close(); }
});

test('MySQL: provisional lines and missing buyer resolve without estimates or double credit', { skip: !integration }, async () => {
  const f = await fixture();
  try {
    const pending = sale({ custom_data: { item_id: 101 }, status: 'paid' }); pending.details.line_items = [];
    const first = await f.engine.transaction(pending, source); assert.equal(first.status, 'pending', first.reason);
    assert.equal((await f.balances())[11], '0.00');
    const final = sale(); assert.equal((await f.engine.transaction(final, source)).status, 'applied');
    assert.equal((await f.balances())[11], '31.50');
  } finally { await f.close(); }
});
test('MySQL: disable accepts no new payments but retains ownership and refund safety for settled payments', { skip: !integration }, async () => {
  const f = await fixture();
  try {
    const t = sale(); await f.engine.transaction(t,source);
    await f.conn.query('UPDATE paddle_accounting_settings SET accept_new=0');
    assert.equal((await f.engine.transaction(sale({ id: 'txn_after_disable' }),source)).handled,false);
    assert.equal((await f.engine.transaction(t,source)).handled,true);
    await f.engine.adjustment(refund(t),t,source);
    assert.equal((await f.balances())[11],'0.00');
  } finally { await f.close(); }
});
test('MySQL: cutoff uses microseconds; delayed old events cannot migrate and exact boundary is included', { skip: !integration }, async () => {
  const f = await fixture();
  try {
    await f.conn.query("UPDATE paddle_accounting_settings SET enabled_from='2030-01-02 12:00:00.123456'");
    assert.equal((await f.engine.transaction(sale({created_at:'2030-01-02T12:00:00.123455Z'}),source)).handled,false);
    assert.equal((await f.engine.transaction(sale({created_at:'2030-01-02T12:00:00.123456Z'}),source)).status,'applied');
  } finally { await f.close(); }
});
test('MySQL: mixed Creator plus marketplace basket is held, and sandbox cannot change real balances', { skip: !integration }, async () => {
  const f = await fixture();
  try {
    const t = sale(); const second = structuredClone(t.details.line_items[0]); second.id='txnitm_core'; second.price_id='pri_creator';
    t.details.line_items.push(second); t.items.push({price:{id:'pri_creator'}});
    const result = await f.engine.transaction(t,source); assert.equal(result.status,'pending');
    assert.equal((await f.balances())[11],'0.00');
    const sandbox = await f.engine.transaction(sale({id:'txn_sandbox'}),{account:'default',environment:'sandbox'});
    assert.equal(sandbox.status,'pending'); assert.equal((await f.balances())[11],'0.00');
  } finally { await f.close(); }
});
test('MySQL: non-refund adjustment is retained for review and cannot erase an author payment', { skip: !integration }, async () => {
  const f = await fixture();
  try {
    const t = sale(); await f.engine.transaction(t,source);
    const a = {...refund(t), action:'chargeback_warning'};
    const result = await f.engine.adjustment(a,t,source);
    assert.equal(result.status,'pending'); assert.match(result.reason,/review/);
    assert.equal((await f.balances())[11],'31.50');
  } finally { await f.close(); }
});
test('MySQL: refund arriving before settlement waits, rejected refund never reduces balance', { skip: !integration }, async () => {
  const f = await fixture();
  try {
    const t = sale({status:'paid'}); t.details.payout_totals=null;
    const a = refund(t);
    assert.equal((await f.engine.adjustment(a,t,source)).status,'pending');
    const final = sale(); a.status='rejected';
    assert.equal((await f.engine.adjustment(a,final,source)).status,'rejected');
    assert.equal((await f.balances())[11],'31.50');
    a.status='approved'; assert.equal((await f.engine.adjustment(a,final,source)).status,'applied');
    assert.equal((await f.balances())[11],'0.00');
  } finally { await f.close(); }
});
test('MySQL: frozen commission terms survive catalog changes on later partial refunds', { skip: !integration }, async () => {
  const f = await fixture();
  try {
    const t = sale(); await f.engine.transaction(t,source);
    await f.conn.query('UPDATE users SET extra_tax=30 WHERE id=11');
    await f.conn.execute('UPDATE marketplace_items SET team=? WHERE id=101',[JSON.stringify({co_author_id:13,percent:90})]);
    const a = refund(t,{earnings:'3500',retained:'250',type:'partial'});
    assert.equal((await f.engine.adjustment(a,t,source)).status,'applied');
    const b=await f.balances(); assert.equal(b[11],'15.75');assert.equal(b[12],'15.75');assert.equal(b[13],'0.00');
  } finally { await f.close(); }
});
test('migration SQL is identical in both apps and never backfills historical rows', async () => {
  const a=await fs.readFile(new URL('../db/migrations/2026_10_21_paddle_actual_accounting.sql',import.meta.url),'utf8');
  const b=await fs.readFile(laravelFile('database/sql/2026_10_21_paddle_actual_accounting.sql'),'utf8');
  assert.equal(a,b);assert.doesNotMatch(a,/\b(?:UPDATE|DELETE FROM)\s+(?:users|sold_items|subscription_systems|subscription_payments)\b/i);
});

test('MySQL: both cabinets read stored movements, pending states and current user amounts', { skip: !integration }, async () => {
  const f=await fixture();
  try {
    const t=sale(); await f.engine.transaction(t,source);
    await f.engine.adjustment(refund(t,{earnings:'3500',retained:'250',type:'partial'}),t,source);
    const pending=sale({id:'txn_pending',status:'paid'});pending.details.payout_totals=null;
    await f.engine.transaction(pending,source);
    const require=createRequire(import.meta.url), ts=require('typescript');
    const body=await fs.readFile(new URL('../lib/paddle-actual.ts',import.meta.url),'utf8');
    const code=ts.transpileModule(body,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const exported={};vm.runInNewContext(code,{exports:exported,process,console,require:name=>{
      if(name==='server-only')return {};
      if(name==='@/lib/db')return {getPool:()=>({execute:f.conn.execute.bind(f.conn)})};
      if(name==='@/lib/paddle-api')return {};
      if(name.endsWith('catalog.mjs'))return {accountingCatalog};
      if(name.endsWith('engine.mjs'))return {createAccounting};
      return require(name);
    }});
    const entries=await exported.getActualEarningsEntries(11);
    assert.equal(entries.length,3);assert.equal(entries.find(e=>e.status==='pending').amount,null);
    assert.deepEqual(Array.from(entries.filter(e=>e.status==='posted'),e=>e.amount).sort(),['-15.75','31.50']);
    assert.equal((await exported.getActualEarningsEntries(13)).length,0);
    const php=await fs.readFile(laravelFile('app/Services/PaddleActualAccounting.php'),'utf8');
    const queries=[...php.matchAll(/= DB::select\("([\s\S]+?)", \[(.*?)\]\);/g)];
    const phpEntries=[];
    for(const [,sql,params] of queries){const [rows]=await f.conn.execute(sql,[params==='$userId'?11:'11']);phpEntries.push(...rows);}
    assert.equal(phpEntries.length,3);
    const componentCode=ts.transpileModule(await fs.readFile(new URL('../components/paddle-actual-earnings.ts',import.meta.url),'utf8'),
      {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const component={};vm.runInNewContext(componentCode,{exports:component,require:name=>name==='@/lib/paddle-actual'?exported:require(name)});
    const html=require('react-dom/server').renderToStaticMarkup(await component.ActualPaddleEarnings({userId:11}));
    assert.match(html,/31\.50 USD/);assert.match(html,/-15\.75 USD/);assert.match(html,/Pending/);
  } finally {await f.close();}
});

async function serverFixture({actualResult={handled:true,status:'applied',buyerId:1,fresh:false},isActual=true}={}) {
  const require=createRequire(import.meta.url), ts=require('typescript'), counts={reversals:0,sql:0};
  const code=ts.transpileModule(await fs.readFile(new URL('../lib/paddle-server.ts',import.meta.url),'utf8'),
    {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const exported={};vm.runInNewContext(code,{exports:exported,process:{env:{}},console,Buffer,setTimeout,require:name=>{
    if(name==='server-only')return {};
    if(name==='@/lib/db')return {getPool:()=>({execute:async sql=>{counts.sql++;return [sql.trim().startsWith('SELECT')?[]:{affectedRows:1}];}})};
    if(name==='@/lib/paddle-actual')return {actualAccounting:{transaction:async()=>actualResult},accountingSource:()=>source,isActualSubscription:async()=>isActual};
    if(name==='@/lib/paddle-laravel-port')return {lookupSubscriptionForGhl:async()=>null,reverseAuthorBalanceForSubscriptionTermination:async()=>counts.reversals++};
    if(name==='@/lib/paddle-api')return {PaddleApiError:class extends Error{}};
    if(name==='@/lib/spunkram-paddle-config')return {isSpunkramExtraGenerationsPriceId:()=>false,isSpunkramSubscriptionPriceId:()=>false};
    if(name==='@/lib/extra-generation-packs')return {getExtraGenPacks:()=>[]};
    if(name.startsWith('@/'))return {};
    return require(name);
  }});
  return {server:exported,counts};
}
test('router: author settlement or pending never cancels an existing MotionFlow site subscription',async()=>{
  for(const status of ['applied','pending']){
    const f=await serverFixture({actualResult:{handled:true,status,buyerId:1,fresh:false}});
    const t=subscription('txn_author');
    const result=await f.server.handlePaddleEvent({event_type:'transaction.completed',data:t},source);
    assert.equal(result.handled,true);assert.equal(f.counts.sql,0);
  }
});
test('router: past_due reverses only the historical branch, not journal-owned author earnings',async()=>{
  for(const isActual of [true,false]){
    const f=await serverFixture({isActual});
    const result=await f.server.handlePaddleEvent({event_type:'subscription.past_due',data:{id:'sub_author',status:'past_due'}},source);
    assert.equal(result.handled,true);assert.equal(f.counts.reversals,isActual?0:1);
  }
});
test('Laravel bridge: HMAC, timestamp and environment are checked before financial processing',async()=>{
  const require=createRequire(import.meta.url), ts=require('typescript'), secret='test-bridge-secret-with-at-least-32-characters';
  const route={};let calls=0;
  const code=ts.transpileModule(await fs.readFile(new URL('../app/(main)/api/internal/paddle-accounting/route.ts',import.meta.url),'utf8'),
    {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{exports:route,process:{env:{PADDLE_ACCOUNTING_BRIDGE_SECRET:secret}},console:{error(){}},Buffer,require:name=>{
    if(name==='next/server')return {NextResponse:{json:(body,options)=>({body,status:options?.status??200})}};
    if(name==='@/lib/paddle-actual')return {accountingSource:()=>source,actualAccounting:{transaction:async()=>{calls++;return {handled:true,status:'pending'};}}};
    if(name==='@/lib/paddle-server')return {forwardActualAccountingPurchase:async()=>{}};
    return require(name);
  }});
  const raw=JSON.stringify({account:'default',environment:'production',event:{event_type:'transaction.completed',data:sale()}});
  const request=(text,when,sig)=>({text:async()=>text,headers:new Headers({'x-accounting-timestamp':when,'x-accounting-signature':sig})});
  const now=String(Math.floor(Date.now()/1000));
  assert.equal((await route.POST(request(raw,now,'0'.repeat(64)))).status,401);
  const old=String(Number(now)-600), sign=(when,text)=>crypto.createHmac('sha256',secret).update(`${when}:${text}`).digest('hex');
  assert.equal((await route.POST(request(raw,old,sign(old,raw)))).status,401);assert.equal(calls,0);
  const wrong=raw.replace('"production"','"sandbox"');
  assert.equal((await route.POST(request(wrong,now,sign(now,wrong)))).status,500);assert.equal(calls,0);
  const result=await route.POST(request(raw,now,sign(now,raw)));assert.equal(result.status,200);assert.equal(result.body.handled,true);assert.equal(calls,1);
});
