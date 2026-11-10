import assert from 'node:assert/strict';
import {test} from 'node:test';
import {odinTestLoader} from './lib/odin-ai-test-runtime.mjs';

const token='Bearer odincep_'+'a'.repeat(64);
const allocation={version:2,plan:'paid',limit:100,period_id:'b'.repeat(64),period_start:'2020-01-01T00:00:00Z',period_end:'2099-01-01T00:00:00Z'};
const profile=()=>({user:{id:'uuid-account',email:'member@test.invalid',name:'Member'},subscription:{active:true,renews_at:'2099-01-01'},entitlements:{ai:allocation}});
function fixture(initial=profile()) {
  let value=initial,status=200;const requests=[];
  const load=odinTestLoader({'@/lib/db':{getPool(){throw new Error('Unit tests must not touch a database');}}},{fetch:async(url,options)=>{
    requests.push({url,options});return Response.json(value,{status});
  }});
  return {load,api:load('@/lib/odin-ai'),requests,set:valueNext=>{value=valueNext;},status:valueNext=>{status=valueNext;}};
}
test('identity, plan and period come only from the fixed server-to-server Odin account endpoint',async()=>{
  const f=fixture();const user=await f.api.resolveOdinAiUser(token);
  assert.equal(user.id,'odin:uuid-account');assert.equal(user.odinAi.limit,100);
  assert.equal(f.requests[0].url,'https://odin-pro.com/api/cep/me?client=odin-cep');
  assert.equal(f.requests[0].options.headers.Authorization,token);
  assert.equal(f.requests[0].options.cache,'no-store');assert.equal(f.requests[0].options.redirect,'error');
});
test('registered accounts accept the server-attested five without being marked as paid subscribers',async()=>{
  const value=profile();value.subscription.active=false;value.entitlements.ai={...allocation,plan:'trial',limit:5};
  const user=await fixture(value).api.resolveOdinAiUser(token);
  assert.equal(user.odinAi.limit,5);assert.equal(user.odinSubscriptionActive,false);
});
test('unsupported/forged tokens do not reach Odin; revoked tokens never authenticate',async()=>{
  const f=fixture();assert.equal(await f.api.resolveOdinAiUser('Bearer mfcep_'+'a'.repeat(64)),null);
  assert.equal(f.requests.length,0);f.status(401);assert.equal(await f.api.resolveOdinAiUser(token),null);
  f.status(503);await assert.rejects(f.api.resolveOdinAiUser(token),/unavailable/);
});
test('legacy or malformed entitlement responses fail closed instead of inventing a fallback allowance',async()=>{
  const f=fixture();
  for(const ai of [undefined,{...allocation,limit:1000},{...allocation,period_id:'client-period'},
    {...allocation,period_start:'invalid'},{...allocation,period_start:'2099-02-01'},
    {...allocation,plan:'trial',limit:100}]){
    const value=profile();value.entitlements.ai=ai;f.set(value);
    await assert.rejects(f.api.resolveOdinAiUser(token),/Odin AI|Odin AI entitlement|Odin AI period/);
  }
  const value=profile();value.subscription.active=false;f.set(value);await assert.rejects(f.api.resolveOdinAiUser(token),/entitlement/);
});
test('expired or blocked allocations reject consumption before any SQL or provider request',async()=>{
  const f=fixture();let user=await f.api.resolveOdinAiUser(token);
  for(const denied of [{...user,odinAi:{...user.odinAi,period_end:'2000-01-01'}},
    {...user,odinAi:{version:2,plan:'blocked',limit:0,period_id:null,period_start:null,period_end:null}}]){
    assert.equal((await f.api.odinAiStatus(denied)).remaining,0);
    assert.equal((await f.api.consumeOdinAi(denied,1)).ok,false);
    assert.equal((await f.api.consumeOdinAi(denied,0)).ok,false);
  }
});
test('invalid generation amounts are rejected at the real billing boundary',async()=>{
  const f=fixture();const user=await f.api.resolveOdinAiUser(token);
  for(const cost of [-1,0.5,NaN,Infinity])await assert.rejects(f.api.consumeOdinAi(user,cost),/Invalid/);
});
test('an invalid supplied Bearer token cannot fall back to a logged-in Motionflow cookie',async()=>{
  let sessionCalls=0;
  const load=odinTestLoader({
    '@/lib/auth/get-session-user':{getSessionUser:async()=>{sessionCalls++;return{id:1};}},
    '@/lib/cep-auth':{resolveCepBearerUser:async()=>null},
    '@/lib/odin-ai':{resolveOdinAiUser:async()=>null},
  });
  const auth=load('@/lib/auth/resolve-captions-user');
  for(const bearer of [token,'Bearer invalid'])assert.equal(await auth.resolveCaptionsUser({bearer,email:'other@test.invalid',userId:'1'}),null);
  assert.equal(sessionCalls,0);
});
test('caption receipts bind to the external account namespace, not a Motionflow numeric account',()=>{
  const previous=process.env.CAPTIONS_CHAPTERS_RECEIPT_SECRET;process.env.CAPTIONS_CHAPTERS_RECEIPT_SECRET='isolated-receipt-secret';
  try{
    const receipts=odinTestLoader()('@/lib/captions-chapters-receipt');
    const receipt=receipts.issueCaptionsChaptersReceipt({userId:'odin:1',durationSeconds:120,cost:1});
    assert.equal(receipts.verifyCaptionsChaptersReceipt(receipt,'odin:1').ok,true);
    assert.equal(receipts.verifyCaptionsChaptersReceipt(receipt,'odin:2').ok,false);
    assert.equal(receipts.verifyCaptionsChaptersReceipt(receipt,1).ok,false);
  }finally{if(previous===undefined)delete process.env.CAPTIONS_CHAPTERS_RECEIPT_SECRET;else process.env.CAPTIONS_CHAPTERS_RECEIPT_SECRET=previous;}
});
