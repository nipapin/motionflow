import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { addDuration, parseRecipients, accessPlan, subscriptionScope, paddlePlan, billingRecovery, renderCampaignEmail, assertSendable, stableId, soldItemAccessCondition } from '../lib/campaigns/core.mjs';
import { inspectRecipient, applyRecipient, sendRecipient } from '../lib/campaigns/engine.mjs';

const now = new Date('2030-10-08T12:00:00Z');
const catalog = {authorId:4141,priceId:'pri_gal',tierPriceIds:['pri_gal'],allPriceIds:['pri_gal'],plan:'yearly',name:'Gal Toolkit MAX',account:'default',environment:'sandbox'};
const subId = 'sub_' + 'a'.repeat(26);
const paddle = () => ({id:subId,status:'active',customer_id:'ctm_fixture',custom_data:{buyer_id:101},currency_code:'USD',collection_mode:'automatic',billing_cycle:{interval:'month',frequency:1},items:[{recurring:true,quantity:1,price:{id:'pri_gal',billing_cycle:{interval:'month',frequency:1}}}],current_billing_period:{ends_at:'2030-11-30T12:00:00Z'},next_billed_at:'2030-11-30T12:00:00Z',scheduled_change:null});
const sourceRow = {id:10,buyer_id:101,subscription_id:subId};
const template = {subject:'{{product_name}} · {{first_name}}',text:'{{access_summary}} {{account_email}} {{account_instructions}} {{access_url}}',html:'<html><body><p>{{first_name}}</p><p>{{access_summary}}</p><a href="{{access_url}}">{{access_label}}</a></body></html>'};
const campaign = () => ({id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',site_origin:'https://premieregal.motionflow.pro',product_name:'Gal Toolkit MAX',grant:{kind:'subscription',subscription:'premiere_gal',duration:'year',itemId:null},template,extension_template:{...template,subject:'Extended through {{expires_at}}'}});
const recipient = () => ({id:1,email:'alex@example.invalid',account_email:'alex@example.invalid',first_name:'Alex',last_name:'Example',state:'pending',outbox_json:null});

test('recipient import normalizes, deduplicates and preserves separate account addresses',()=>{
  const result=parseRecipients('Email,First Name,Account Email\n ALEX@example.invalid ,Alex,account@example.invalid\n ALEX@example.invalid ,Alex,account@example.invalid');
  assert.equal(result.duplicates,1);assert.equal(result.recipients[0].account_email,'account@example.invalid');
  assert.equal(parseRecipients('a@example.invalid\nb@example.invalid').recipients.length,2);
});
test('recipient import rejects conflicts, malformed columns and header-only lists',()=>{
  for(const input of ['a@example.invalid,b@example.invalid','Email,First Name\na@example.invalid','Email\n','Email,Email\na@example.invalid,b@example.invalid','Email,First Name\na@example.invalid,A\na@example.invalid,B','bad@value']) assert.throws(()=>parseRecipients(input));
});
test('calendar durations clamp month end and leap days',()=>{
  assert.equal(addDuration(new Date('2031-01-31T12:00:00Z'),'month').toISOString(),'2031-02-28T12:00:00.000Z');
  assert.equal(addDuration(new Date('2032-02-29T12:00:00Z'),'year').toISOString(),'2033-02-28T12:00:00.000Z');
});
test('access starts after latest paid/bonus period including cancelled paid access',()=>{
  const plan=accessPlan([{status:1,ends_at:'2030-11-08 12:00:00',paddle_billing_period_ends_at:'2030-12-08 12:00:00'},{status:-1,ends_at:'2031-01-08 12:00:00'},{status:0,ends_at:'2040-01-01 00:00:00'}],'year',now);
  assert.equal(plan.base_at,'2031-01-08 12:00:00');assert.equal(plan.expires_at,'2032-01-08 12:00:00');
});
test('expired grants restart now; existing lifetime access stays unlimited',()=>{
  assert.equal(accessPlan([{status:1,ends_at:'2029-01-01'}],'month',now).expires_at,'2030-11-08 12:00:00');
  assert.equal(accessPlan([{status:1,plan:'lifetime'}],'year',now).action,'keep_existing');
});
test('main catalog includes legacy subscriptions and excludes one-time generation packs',()=>{
  const rows=[{id:1,author_id:null,paddle_price_id:null},{id:2,author_id:4141,paddle_price_id:'gal'},{id:3,author_id:null,paddle_price_id:'extra'}];
  assert.deepEqual(subscriptionScope(rows,{authorId:null,excludedPriceIds:['extra']}).map(r=>r.id),[1]);
});
test('extension template renders final date, escaped names and proper existing-account URL',()=>{
  const message=renderCampaignEmail(campaign(),{...recipient(),action:'extend_access',expires_at:'2031-11-30 12:00:00',first_name:'<Alex>'});
  assert.match(message.subject,/November 30, 2031/);assert.match(message.html,/&lt;Alex&gt;/);assert.match(message.html,/https:\/\/premieregal.motionflow.pro\//);assert.doesNotMatch(message.text,/undefined|\{\{/);assertSendable(message);
});
test('new-account password link is appended even to a template lacking link variables',()=>{
  const c={...campaign(),template:{subject:'Welcome',text:'Hello',html:'<body>Hello</body>'}};
  const message=renderCampaignEmail(c,recipient(),'https://premieregal.motionflow.pro/reset-password?token=real&email=alex');
  assert.match(message.text,/reset-password/);assert.match(message.html,/token=real&amp;email/);
});
test('send rejects preview markers and unresolved variables',()=>{
  for(const token of ['TEST_Preview','PREVIEW_ONLY','{{email}}'])assert.throws(()=>assertSendable({subject:'Ready',html:token,text:'Text'}));
});
test('stable entitlement ids are deterministic and scoped by campaign',()=>{
  assert.equal(stableId('a','b'),stableId('a','b'));assert.notEqual(stableId('a','b'),stableId('c','b'));
});
test('Paddle journal recovers a lost response without a second extension',()=>{
  const sub=paddle(),plan=paddlePlan(sourceRow,sub,catalog,'year',now);
  assert.equal(plan.target,'2031-11-30T12:00:00.000Z');assert.equal(billingRecovery(plan,sub,catalog,now),'move');
  sub.next_billed_at=plan.target;assert.equal(billingRecovery(plan,sub,catalog,now),'synced');
});
test('Paddle blocks changed products, identity, environment, buyer and billing dates',()=>{
  const plan=paddlePlan(sourceRow,paddle(),catalog,'year',now);
  for(const patch of [{id:'sub_other'},{custom_data:{buyer_id:102}},{next_billed_at:'2030-12-30T12:00:00Z'},{scheduled_change:{action:'cancel'}},{items:[]}])assert.throws(()=>billingRecovery(plan,{...paddle(),...patch},catalog,now));
  assert.throws(()=>billingRecovery(plan,paddle(),{...catalog,environment:'production'},now));
});
test('Paddle does not resume cancelled accounts or permit trials/debt/imminent renewals',()=>{
  assert.equal(paddlePlan(sourceRow,{...paddle(),status:'canceled'},catalog,'year',now),null);
  for(const status of ['trialing','past_due'])assert.throws(()=>paddlePlan(sourceRow,{...paddle(),status},catalog,'year',now));
  assert.throws(()=>paddlePlan(sourceRow,paddle(),catalog,'year',new Date('2030-11-30T11:40:00Z')));
});

// Opt-in integration uses ONLY connection-scoped temporary tables. Paddle and
// Resend are injected fixtures; no real users, subscriptions or mail are changed.
test('MySQL campaign integration in temporary tables',{skip:!process.argv.includes('--database')},async t=>{
  const mysql=await import('mysql2/promise');
  const conn=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database:process.env.DB_DATABASE,timezone:'Z'});
  try {
    await conn.query("SET time_zone='+00:00'");
    for(const name of ['users','subscription_systems','sold_items','password_reset_tokens']) {
      const [ddl]=await conn.query(`SHOW CREATE TABLE \`${name}\``);
      const sql=ddl[0]['Create Table'].replace('CREATE TABLE','CREATE TEMPORARY TABLE').replace(/,\s*CONSTRAINT[^\n]+/g,'');
      await conn.query(sql);
    }
    const migration=readFileSync(new URL('../db/migrations/2026_10_08_admin_campaigns.sql',import.meta.url),'utf8').replaceAll('CREATE TABLE IF NOT EXISTS','CREATE TEMPORARY TABLE').replace(/,\s*CONSTRAINT campaign_recipients_parent[^\n]+/,'');
    for(const sql of migration.split(';').map(s=>s.trim()).filter(Boolean))await conn.query(sql);
    const read=async()=> (await conn.execute('SELECT * FROM admin_campaign_recipients WHERE id=1'))[0][0];
    const reset=async(existing=false)=>{
      for(const name of ['admin_campaign_recipients','users','subscription_systems','sold_items','password_reset_tokens'])await conn.query(`DELETE FROM \`${name}\``);
      await conn.execute("INSERT INTO admin_campaign_recipients (id,campaign_id,email,account_email,first_name,last_name) VALUES (1,?,?,?,?,?)",[campaign().id,recipient().email,recipient().account_email,'Alex','Example']);
      if(existing)await conn.execute("INSERT INTO users (id,name,email,password,first_name,last_name,mailing,created_at,updated_at) VALUES (101,'fixture',?,'discarded','Alex','Example',0,UTC_TIMESTAMP(),UTC_TIMESTAMP())",[recipient().email]);
    };
    const seedSub=async()=>conn.execute("INSERT INTO subscription_systems (id,buyer_id,subscription_id,payment_id,status,amount,amount_summary,price,system_tax,`system`,type,plan,paddle_price_id,paddle_product_name,count,ends_at,paddle_billing_period_ends_at,author_id,author_earn,created_at,updated_at) VALUES (10,101,?,'fixture',1,0,0,0,0,'paddle','personal','monthly','pri_gal','Gal Toolkit MAX',1,'2030-11-08 12:00:00','2030-11-08 12:00:00',4141,0,UTC_TIMESTAMP(),UTC_TIMESTAMP())",[subId]);
    let live,moves,sends,loseMove,loseMail;
    const services=()=>({catalog:()=>catalog,item:{id:99,author_id:4141,name:'Item'},from:'Test <test@example.invalid>',paddle:{get:async()=>structuredClone(live),move:async(id,target)=>{moves++;live.next_billed_at=target;live.current_billing_period.ends_at=target;if(loseMove){loseMove=false;throw new Error('Fixture lost Paddle response');}return structuredClone(live);}},mail:{emails:{send:async(payload,options)=>{sends.push({payload:structuredClone(payload),options});if(loseMail){loseMail=false;throw new Error('Fixture lost Resend response');}return {data:{id:'fixture-email'},error:null};}}}});
    const init=async(existing=false)=>{await reset(existing);live=paddle();moves=0;sends=[];loseMove=false;loseMail=false;};
    const failOnce=fragment=>{
      let fail=true;
      return {beginTransaction:()=>conn.beginTransaction(),commit:()=>conn.commit(),rollback:()=>conn.rollback(),execute:(sql,params)=>{
        if(fail && sql.includes(fragment)){fail=false;throw new Error('Fixture SQL failure');}
        return conn.execute(sql,params);
      }};
    };
    await t.test('preview reads live billing end without writing users or access',async()=>{
      await init(true);await seedSub();const plan=await inspectRecipient(conn,campaign(),await read(),services(),now);
      assert.equal(plan.base_at,'2030-11-30 12:00:00');assert.equal(plan.expires_at,'2031-11-30 12:00:00');assert.equal(moves,0);
      assert.equal(Number((await conn.query('SELECT COUNT(*) n FROM subscription_systems'))[0][0].n),1);
    });
    await t.test('lost Paddle response resumes without granting or postponing twice',async()=>{
      await init(true);await seedSub();loseMove=true;
      await assert.rejects(applyRecipient(conn,campaign(),await read(),services(),now),/lost Paddle/);
      assert.equal((await read()).state,'applied');assert.equal(moves,1);
      await applyRecipient(conn,campaign(),await read(),services(),now);assert.equal((await read()).state,'ready');assert.equal(moves,1);
      await applyRecipient(conn,campaign(),await read(),services(),now);
      assert.equal(Number((await conn.query("SELECT COUNT(*) n FROM subscription_systems WHERE `system`='admin'"))[0][0].n),1);
      assert.equal((await conn.query('SELECT ends_at FROM subscription_systems WHERE id=10'))[0][0].ends_at.toISOString(),'2031-11-30T12:00:00.000Z');
    });
    await t.test('recurring billing moves beyond any later existing bonus period',async()=>{
      await init(true);await seedSub();await conn.query("UPDATE subscription_systems SET ends_at='2031-04-08 12:00:00' WHERE id=10");
      await applyRecipient(conn,campaign(),await read(),services(),now);
      assert.equal(live.next_billed_at,'2032-04-08T12:00:00.000Z');assert.equal((await read()).expires_at.toISOString(),live.next_billed_at);
    });
    await t.test('SQL failure after Paddle mutation resumes the same target',async()=>{
      await init(true);await seedSub();
      await assert.rejects(applyRecipient(failOnce('SET billing_json=?'),campaign(),await read(),services(),now),/SQL failure/);
      assert.equal((await read()).state,'applied');assert.equal(moves,1);
      await applyRecipient(conn,campaign(),await read(),services(),now);assert.equal((await read()).state,'ready');assert.equal(moves,1);
    });
    await t.test('new account and entitlement roll back together on SQL failure',async()=>{
      await init();await assert.rejects(applyRecipient(failOnce('INSERT INTO subscription_systems'),campaign(),await read(),services(),now),/SQL failure/);
      assert.equal((await read()).state,'pending');assert.equal(Number((await conn.query('SELECT COUNT(*) n FROM users'))[0][0].n),0);
    });
    await t.test('a campaign cannot silently replace a different active tier',async()=>{
      await init(true);await seedSub();await conn.query("UPDATE subscription_systems SET paddle_price_id='pri_ai' WHERE id=10");live.items[0].price.id='pri_ai';
      const svc={...services(),catalog:()=>({...catalog,allPriceIds:['pri_gal','pri_ai']})};
      await assert.rejects(applyRecipient(conn,campaign(),await read(),svc,now),/different tier/);assert.equal(moves,0);assert.equal((await read()).state,'pending');
    });
    await t.test('lifetime access with continuing billing requires manual resolution',async()=>{
      await init(true);await seedSub();await conn.query("UPDATE subscription_systems SET plan='lifetime' WHERE id=10");
      await assert.rejects(applyRecipient(conn,campaign(),await read(),services(),now),/lifetime account/);assert.equal(moves,0);
    });
    await t.test('new account uses a genuine hashed token and stable retry payload',async()=>{
      await init();const c={...campaign(),grant:{...campaign().grant,kind:'invite'}};
      await applyRecipient(conn,c,await read(),services(),now);loseMail=true;
      await assert.rejects(sendRecipient(conn,c,await read(),services(),now),/lost Resend/);
      const pending=await read();assert.equal(pending.state,'sending');const box=typeof pending.outbox_json==='string'?JSON.parse(pending.outbox_json):pending.outbox_json;
      const url=new URL(box.payload.text.match(/https:\/\/\S+/)[0]);const token=url.searchParams.get('token');assert.match(token,/^[a-f0-9]{64}$/);assert.equal(url.hostname,'premieregal.motionflow.pro');
      const hash=(await conn.query('SELECT token FROM password_reset_tokens'))[0][0].token;assert.notEqual(hash,token);assert(await bcrypt.compare(token,hash));
      await sendRecipient(conn,c,await read(),services(),new Date(now.getTime()+60000));
      assert.equal((await read()).state,'sent');assert.deepEqual(sends[0],sends[1]);assert.equal((await read()).outbox_json,null);
    });
    await t.test('existing account email does not replace password-reset tokens',async()=>{
      await init(true);const c={...campaign(),grant:{...campaign().grant,kind:'invite'}};
      await applyRecipient(conn,c,await read(),services(),now);await sendRecipient(conn,c,await read(),services(),now);
      assert.equal(Number((await conn.query('SELECT COUNT(*) n FROM password_reset_tokens'))[0][0].n),0);assert.doesNotMatch(sends[0].payload.text,/reset-password/);
    });
    await t.test('sending is blocked while billing remains unsynchronized',async()=>{
      await init(true);await seedSub();loseMove=true;await assert.rejects(applyRecipient(conn,campaign(),await read(),services(),now));
      await assert.rejects(sendRecipient(conn,campaign(),await read(),services(),now),/synchronization/);assert.equal(sends.length,0);
    });
    await t.test('preview marker rolls back token and outbox writes',async()=>{
      await init();const c={...campaign(),grant:{...campaign().grant,kind:'invite'},template:{...template,subject:'TEST_Preview'}};
      await applyRecipient(conn,c,await read(),services(),now);await assert.rejects(sendRecipient(conn,c,await read(),services(),now),/Preview tokens/);
      assert.equal((await read()).state,'ready');assert.equal(Number((await conn.query('SELECT COUNT(*) n FROM password_reset_tokens'))[0][0].n),0);assert.equal(sends.length,0);
    });
    await t.test('uncertain email older than provider idempotency window cannot resend',async()=>{
      await init();const c={...campaign(),grant:{...campaign().grant,kind:'invite'}};await applyRecipient(conn,c,await read(),services(),now);loseMail=true;await assert.rejects(sendRecipient(conn,c,await read(),services(),now));
      await assert.rejects(sendRecipient(conn,c,await read(),services(),new Date(now.getTime()+24*3600000)),/23 hours/);assert.equal(sends.length,1);
    });
    await t.test('timed product access expires and remains idempotent',async()=>{
      await init();const c={...campaign(),grant:{...campaign().grant,kind:'item',itemId:99,duration:'month'}};
      await applyRecipient(conn,c,await read(),services(),now);await applyRecipient(conn,c,await read(),services(),now);
      assert.equal(Number((await conn.query('SELECT COUNT(*) n FROM sold_items'))[0][0].n),1);
      await conn.query("UPDATE sold_items SET arguments=JSON_OBJECT('access_expires_at','2000-01-01 00:00:00')");
      assert.equal(Number((await conn.query('SELECT COUNT(*) n FROM sold_items WHERE '+soldItemAccessCondition()))[0][0].n),0);
      await conn.query("UPDATE sold_items SET arguments=JSON_OBJECT('access_expires_at',NULL)");
      assert.equal(Number((await conn.query('SELECT COUNT(*) n FROM sold_items WHERE '+soldItemAccessCondition()))[0][0].n),1);
    });
  } finally {await conn.end();}
});
