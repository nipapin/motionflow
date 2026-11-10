import {test,before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createOdinTestPool,applyOdinTestSchema,odinTestLoader} from './lib/odin-ai-test-runtime.mjs';
import {createOdinDatabase,seedOdinAccounts,signInDevice,accounts} from '../../ione-premiere-basics/tests/cep/fixtures/odin.mjs';

const pool=createOdinTestPool();let website;const identities=new Map();
const secret='isolated-odin-usage-management-secret';
const originalSecret=process.env.ODIN_MANAGEMENT_SECRET;
const load=odinTestLoader({'@/lib/db':{getPool:()=>pool}},{fetch:async(url,options)=>{
  assert.equal(url,'https://odin-pro.com/api/cep/me?client=odin-cep');
  const identity=await website.auth.authenticate(options.headers.Authorization);
  return identity?Response.json(await website.auth.profile(identity)):Response.json({error:'UNAUTHORIZED'},{status:401});
}});
const ai=load('@/lib/odin-ai');const operations=load('@/lib/odin-ai-operations');
const usage=load('@/lib/odin-ai-usage');const endpoint=load('@/app/(main)/api/integrations/odin/ai/route');
before(async()=>{
  process.env.ODIN_MANAGEMENT_SECRET=secret;
  website=await seedOdinAccounts(await createOdinDatabase());
  for(const name of ['paid','seat','trial'])identities.set(name,await signInDevice(website,name));
  await applyOdinTestSchema(pool);
});
beforeEach(async()=>{await pool.query('DELETE FROM odin_ai_operations');await pool.query('DELETE FROM odin_ai_period_usage');});
after(async()=>{await pool.end();await website?.close();if(originalSecret===undefined)delete process.env.ODIN_MANAGEMENT_SECRET;else process.env.ODIN_MANAGEMENT_SECRET=originalSecret;});
const profile=name=>website.auth.profile({id:'website',user_id:accounts[name].id});
const user=async name=>ai.odinAiUserFromProfile(await profile(name));
const post=(body,token=secret)=>endpoint.POST(new Request('https://motionflow-test.invalid/api/integrations/odin/ai',{
  method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify(body),
}));
async function generate(name,cost,tool='captions'){
  const identity=await user(name);const id=randomUUID();
  const request=new Request('https://motionflow-test.invalid/api/generations/'+tool,{method:'POST',
    headers:{authorization:`Bearer ${identities.get(name).token}`,'idempotency-key':id}});
  const response=await operations.withOdinAiOperation(request,identity,tool,{fixture:true},async()=>{
    const consumed=await ai.consumeOdinAi(identity,cost);
    return Response.json({text:'Private transcript must never appear in Usage',generations:consumed.status});
  });
  assert.equal(response.status,200);return id;
}

test('website Usage reads the real committed debit and metadata, without returning results or charging again',async()=>{
  const id=await generate('paid',2);
  const response=await post({action:'usage',profile:await profile('paid')});assert.equal(response.status,200);
  const data=await response.json();assert.equal(data.balance.remaining,98);assert.equal(data.balance.used,2);
  assert.equal(data.usage.total,1);assert.deepEqual(data.usage.items.map(row=>({id:row.id,tool:row.tool,cost:row.cost})),[{id,tool:'captions',cost:2}]);
  assert.ok(Number.isFinite(Date.parse(data.usage.items[0].createdAt)));
  assert.equal(JSON.stringify(data).includes('Private transcript'),false);
  assert.equal((await ai.odinAiStatus(await user('paid'))).used,2);
});
test('Seats share a period but cannot read the owner\'s usage records',async()=>{
  await generate('paid',2);const id=await generate('seat',1);
  const data=await usage.odinAccountUsage(await user('seat'),1);
  assert.equal(data.balance.used,1);assert.equal(data.usage.total,1);assert.equal(data.usage.items[0].id,id);
});
test('old periods do not appear in current Usage; trial accounts have their actual five',async()=>{
  const identity=await user('trial');
  await pool.execute(`INSERT INTO odin_ai_operations(user_id,operation_id,period_id,tool,request_hash,cost,response_body,http_status)
    VALUES(?,?,?,?,?,?,?,200)`,[identity.id,'old-period-operation','a'.repeat(64),'captions','b'.repeat(64),5,'{"text":"old private output"}']);
  const data=await usage.odinAccountUsage(identity,1);
  assert.equal(data.balance.limit,5);assert.equal(data.balance.remaining,5);assert.equal(data.usage.total,0);
  const blocked=await usage.odinAccountUsage({...identity,odinAi:{...identity.odinAi,plan:'blocked',limit:0}},2);
  assert.equal(blocked.balance.remaining,0);assert.equal(blocked.usage.page,2);assert.equal(blocked.usage.total,0);
});
test('pagination stays account-scoped and rejects invalid input',async()=>{
  const identity=await user('paid');await ai.consumeOdinAi(identity,21);
  for(let i=0;i<21;i++)await pool.execute(`INSERT INTO odin_ai_operations(user_id,operation_id,period_id,tool,request_hash,cost,response_body,http_status)
    VALUES(?,?,?,?,?,?,?,200)`,[identity.id,`fixture-${String(i).padStart(4,'0')}`,identity.odinAi.period_id,'captions','b'.repeat(64),1,'{}']);
  const first=await usage.odinAccountUsage(identity,1),second=await usage.odinAccountUsage(identity,2);
  assert.equal(first.usage.items.length,20);assert.equal(second.usage.items.length,1);assert.equal(first.usage.total,21);
  assert.equal(new Set([...first.usage.items,...second.usage.items].map(row=>row.id)).size,21);
  for(const value of [-1,0,1.5,'bad',Infinity,10001])assert.throws(()=>usage.usagePage(value),/INVALID_PAGE/);
});
test('the private integration rejects browser/CEP claims without its server credential and rejects forged quotas',async()=>{
  for(const token of ['wrong',identities.get('paid').token]){
    assert.equal((await post({action:'usage',profile:await profile('paid')},token)).status,401);
  }
  const forged=await profile('trial');forged.entitlements.ai.limit=999;
  assert.equal((await post({action:'usage',profile:forged})).status,400);
  assert.equal((await post({action:'download',profile:await profile('paid')})).status,400);
});
