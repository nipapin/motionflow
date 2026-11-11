import {test,before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createOdinTestPool,applyOdinTestSchema,odinTestLoader} from './lib/odin-ai-test-runtime.mjs';
import {createOdinDatabase,seedOdinAccounts,signInDevice,accounts} from '../../ione-premiere-basics/tests/cep/fixtures/odin.mjs';

const pool=createOdinTestPool();
let website;const identities=new Map();
let authCalls=0;
const transport=async(url,options)=>{
  assert.equal(url,'https://odin-pro.com/api/cep/me?client=odin-cep');authCalls++;
  const identity=await website.auth.authenticate(options.headers.Authorization);
  return identity?Response.json(await website.auth.profile(identity)):Response.json({error:'UNAUTHORIZED'},{status:401});
};
const load=odinTestLoader({'@/lib/db':{getPool:()=>pool}},{fetch:transport});
const ai=load('@/lib/odin-ai');
const jobs=load('@/lib/odin-ai-operations');
const credits=load('@/lib/cep-generations');

before(async()=>{
  website=await seedOdinAccounts(await createOdinDatabase());
  for(const name of Object.keys(accounts))identities.set(name,await signInDevice(website,name));
  await applyOdinTestSchema(pool);
  await pool.query(`CREATE TABLE IF NOT EXISTS subscription_systems(id BIGINT PRIMARY KEY AUTO_INCREMENT,buyer_id BIGINT,
    author_id BIGINT,status INT,plan VARCHAR(100),ends_at DATETIME,paddle_billing_period_ends_at DATETIME,
    scheduled_change_action VARCHAR(40),paddle_product_name VARCHAR(100),paddle_price_id VARCHAR(100))`);
});
beforeEach(async()=>{await pool.query('DELETE FROM odin_ai_operations');await pool.query('DELETE FROM odin_ai_period_usage');});
after(async()=>{await pool.end();await website?.close();});
const user=async(name='paid')=>ai.resolveOdinAiUser(`Bearer ${identities.get(name).token}`);
const request=(name='paid',id=randomUUID(),signal)=>new Request('https://motionflow-test.invalid/api/generations/captions',{
  method:'POST',headers:{authorization:`Bearer ${identities.get(name).token}`,'idempotency-key':id},signal,
});
function providerWork(identity,cost,provider=async()=>({text:'mock external provider output'})) {
  return async()=>{
    const status=await credits.generationsStatusForResolvedUser(identity);
    if(status.remaining<cost)return Response.json({code:'GENERATION_LIMIT_REACHED'},{status:402});
    const result=await provider();
    const consumed=await credits.consumeGenerationForResolvedUser(identity,'captions',cost);
    return consumed.ok?Response.json({...result,generations:consumed.status}):Response.json({code:'GENERATION_LIMIT_REACHED'},{status:402});
  };
}

test('real Odin token/profile and MySQL ledger expose 100 paid / 5 registered / 5 expired; admin role does not invent a quota',async()=>{
  for(const name of ['paid','seat','trial','expired','admin']) {
    const identity=await user(name);const status=await ai.odinAiStatus(identity);
    assert.equal(status.limit,['paid','seat'].includes(name)?100:5);
    assert.equal(status.remaining,status.limit);assert.ok(status.resets_at);
  }
  assert.ok(authCalls>=5);
});
test('shared period still gives each Seat account its own independent 100',async()=>{
  const owner=await user('paid'),seat=await user('seat');
  assert.equal(owner.odinAi.period_id,seat.odinAi.period_id);
  await ai.consumeOdinAi(owner,20);
  assert.equal((await ai.odinAiStatus(owner)).remaining,80);
  assert.equal((await ai.odinAiStatus(seat)).remaining,100);
});
test('real conditional SQL enforces sufficient, exact, insufficient and zero balances without negatives',async()=>{
  const identity=await user();
  assert.equal((await ai.consumeOdinAi(identity,99)).ok,true);
  assert.equal((await ai.consumeOdinAi(identity,2)).ok,false);
  assert.equal((await ai.consumeOdinAi(identity,1)).ok,true);
  assert.equal((await ai.consumeOdinAi(identity,1)).ok,false);
  assert.equal((await ai.odinAiStatus(identity)).remaining,0);
  const [rows]=await pool.execute('SELECT used FROM odin_ai_period_usage WHERE user_id=?',[identity.id]);assert.equal(rows[0].used,100);
});
test('simultaneous transactions across pooled connections cannot overdraw a paid or free account',async()=>{
  for(const name of ['paid','trial']) {
    const identity=await user(name);const limit=identity.odinAi.limit;
    const outcomes=await Promise.allSettled(Array.from({length:limit+20},()=>ai.consumeOdinAi(identity,1)));
    assert.equal(outcomes.filter(result=>result.status==='rejected').length,0);
    assert.equal(outcomes.filter(result=>result.value?.ok).length,limit);
    assert.equal((await ai.odinAiStatus(identity)).used,limit);
  }
});
test('a completed operation replays the same result once without another provider call or debit',async()=>{
  const identity=await user();let calls=0;const id=randomUUID();const payload={durationSeconds:600};
  const work=providerWork(identity,2,async()=>({text:`result-${++calls}`}));
  const first=await jobs.withOdinAiOperation(request('paid',id),identity,'captions',payload,work);
  assert.equal(first.status,200);assert.equal((await first.json()).generations.remaining,98);
  const second=await jobs.withOdinAiOperation(request('paid',id),identity,'captions',payload,work);
  assert.equal(second.headers.get('Idempotency-Replayed'),'true');assert.equal(calls,1);
  assert.equal((await second.json()).generations.remaining,98);
  assert.equal((await ai.odinAiStatus(identity)).used,2);
  const conflict=await jobs.withOdinAiOperation(request('paid',id),identity,'captions',{durationSeconds:900},work);
  assert.equal(conflict.status,409);assert.equal(calls,1);
});
test('parallel HTTP operations acquire a database account lock before paid provider work',async()=>{
  const identity=await user();let finish;let started;
  const began=new Promise(resolve=>{started=resolve;});const waiting=new Promise(resolve=>{finish=resolve;});
  const first=jobs.withOdinAiOperation(request(),identity,'captions',{job:1},providerWork(identity,1,async()=>{
    started();await waiting;return{text:'one'};
  }));
  await began;
  let secondCalls=0;
  const second=await jobs.withOdinAiOperation(request(),identity,'captions',{job:2},providerWork(identity,1,async()=>{secondCalls++;return{text:'two'};}));
  assert.equal(second.status,409);assert.equal(secondCalls,0);finish();assert.equal((await first).status,200);
  assert.equal((await ai.odinAiStatus(identity)).used,1);
});
test('provider error, timeout, 429 and cancellation debit zero and release the lock for retry',async()=>{
  const identity=await user();
  for(const kind of ['error','timeout','429','cancel']) {
    const controller=new AbortController();const id=randomUUID();
    const work=async()=>{
      await credits.consumeGenerationForResolvedUser(identity,'captions',3);
      if(kind==='cancel'){controller.abort();throw new DOMException('Cancelled','AbortError');}
      if(kind==='429')return Response.json({error:'rate limited'},{status:429});
      throw new Error(kind);
    };
    if(kind==='error'||kind==='timeout')await assert.rejects(jobs.withOdinAiOperation(request('paid',id,controller.signal),identity,'captions',{kind},work),new RegExp(kind));
    else assert.equal((await jobs.withOdinAiOperation(request('paid',id,controller.signal),identity,'captions',{kind},work)).status,kind==='cancel'?499:429);
    assert.equal((await ai.odinAiStatus(identity)).used,0);
    const retry=await jobs.withOdinAiOperation(request('paid',id),identity,'captions',{kind},providerWork(identity,1));
    assert.equal(retry.status,200);
    await pool.query('DELETE FROM odin_ai_operations');await pool.query('DELETE FROM odin_ai_period_usage');
  }
});
test('SQL failure while storing a successful response rolls its debit back atomically',async()=>{
  const identity=await user();
  await pool.query("CREATE TRIGGER odin_ai_test_reject_insert BEFORE INSERT ON odin_ai_operations FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Test cache failure'");
  try{await assert.rejects(jobs.withOdinAiOperation(request(),identity,'captions',{job:'failure'},providerWork(identity,4)),/Test cache failure/);}
  finally{await pool.query('DROP TRIGGER odin_ai_test_reject_insert');}
  assert.equal((await ai.odinAiStatus(identity)).used,0);
});
test('refund during a provider call revalidates access before commit; paid usage never consumes the five trial credits',async()=>{
  const identity=await user();await ai.consumeOdinAi(identity,80);
  const response=await jobs.withOdinAiOperation(request(),identity,'captions',{job:'refund'},providerWork(identity,1,async()=>{
    await website.db.query('UPDATE subscriptions SET access_revoked_at=NOW() WHERE user_id=$1',[accounts.paid.id]);return{text:'late result'};
  }));
  try{
    assert.equal(response.status,409);const free=await user();assert.equal((await ai.odinAiStatus(free)).remaining,5);
    assert.equal((await ai.consumeOdinAi(free,1)).status.remaining,4);
  }finally{await website.db.query('UPDATE subscriptions SET access_revoked_at=NULL WHERE user_id=$1',[accounts.paid.id]);}
});
test('revoked/invalid tokens never fall back to client identity, cookies or a cached generation',async()=>{
  assert.equal(await ai.resolveOdinAiUser('Bearer odincep_'+'0'.repeat(64)),null);
  assert.equal(await ai.resolveOdinAiUser('Bearer mfcep_'+'a'.repeat(64)),null);
  const {resolveCaptionsUser}=load('@/lib/auth/resolve-captions-user');
  assert.equal(await resolveCaptionsUser({bearer:'Bearer odincep_'+'0'.repeat(64),email:accounts.paid.email,userId:accounts.paid.id}),null);
});

test('protected caption assets require the requested brand and a subscription or available generations',async()=>{
  const auth=load('@/lib/auth/resolve-captions-user');const registry=load('@/lib/cep-client-registry');
  const paid=await user();const free=await user('trial');
  assert.equal(await auth.userCanDownloadCaptionProject(paid,'odin'),true);
  for(const brand of ['gal','spunkram'])assert.equal(await auth.userCanDownloadCaptionProject(paid,brand),false);
  assert.equal(await auth.userCanDownloadCaptionProject(free,'odin'),true);
  assert.equal(await auth.userCanDownloadCaptionProject({id:1001,source:'session'},'odin'),false);
  for(const client of ['gal-cep','spunkram-cep']){
    const cfg=registry.requireCepClientConfig(client);const brand=client==='gal-cep'?'gal':'spunkram';
    await pool.execute(`INSERT INTO subscription_systems(buyer_id,author_id,status,plan,ends_at)
      VALUES(1001,?,1,'ai_toolkit','2099-01-01')`,[cfg.authorId]);
    const identity={id:1001,source:'cep-bearer',cepClient:client};
    assert.equal(await auth.userCanDownloadCaptionProject(identity,brand),true);
    assert.equal(await auth.userCanDownloadCaptionProject(identity,brand==='gal'?'spunkram':'gal'),false);
    assert.equal(await auth.userCanDownloadCaptionProject(identity,'odin'),false);
  }
  await pool.query('DELETE FROM subscription_systems');
});

test('a public account cannot assign itself credits by calling the administrative API',async()=>{
  const saved=process.env.MOTIONFLOW_ADMIN_API_SECRET;process.env.MOTIONFLOW_ADMIN_API_SECRET='isolated-admin-secret';
  try{
    const route=load('@/app/(main)/api/admin/user-generation-credits/route');
    const response=await route.POST(new Request('https://motionflow-test.invalid/api/admin/user-generation-credits',{
      method:'POST',headers:{authorization:`Bearer ${identities.get('paid').token}`,'content-type':'application/json'},
      body:JSON.stringify({userId:1,setExtraBalance:10000}),
    }));
    assert.equal(response.status,401);assert.equal((await ai.odinAiStatus(await user())).remaining,100);
  }finally{if(saved===undefined)delete process.env.MOTIONFLOW_ADMIN_API_SECRET;else process.env.MOTIONFLOW_ADMIN_API_SECRET=saved;}
});
