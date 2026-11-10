import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

const base=process.env.ODIN_AI_HTTP_TEST_ORIGIN||'http://127.0.0.1:13900';
if(base!=='http://127.0.0.1:13900')throw new Error('HTTP fixtures refuse a non-isolated origin');
const sessions=new Map();const tokens=new Map();const password='OdinFixture!2026';
class BrowserSession {
  cookies=new Map();
  async fetch(path,options={}) {
    const headers=new Headers(options.headers);headers.set('user-agent','Odin-Isolated-E2E');headers.set('origin',base);
    headers.set('cookie',[...this.cookies].map(([key,value])=>`${key}=${value}`).join('; '));
    const response=await fetch(base+path,{...options,headers,redirect:'manual'});
    for(const cookie of response.headers.getSetCookie()){
      const [pair]=cookie.split(';');const split=pair.indexOf('=');const key=pair.slice(0,split),value=pair.slice(split+1);
      if(value)this.cookies.set(key,value);else this.cookies.delete(key);
    }
    return response;
  }
  async csrf(){await this.fetch('/');return this.cookies.get('csrf_token');}
}
async function login(name) {
  if(sessions.has(name))return sessions.get(name);
  const browser=new BrowserSession();const csrfToken=await browser.csrf();
  const response=await browser.fetch('/test/login',{method:'POST',body:new URLSearchParams({email:`${name}@odin-test.invalid`,password,csrfToken})});
  assert.equal(response.status,303);sessions.set(name,browser);return browser;
}
async function tokenFor(name) {
  if(tokens.has(name))return tokens.get(name);
  const browser=await login(name);
  const started=await fetch(base+'/api/cep/auth/device',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({client:'odin-cep',usp:`isolated-http-${name}-${randomUUID()}`,device:{user:name,os:'Test'}})}).then(response=>response.json());
  assert.ok(started.code);
  const approved=await browser.fetch('/api/cep/auth/confirm',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({client:'odin-cep',code:started.code,action:'approve'})});
  assert.equal(approved.status,200);
  const claimed=await fetch(base+'/api/cep/auth/token',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({client:'odin-cep',code:started.code,device_code:started.device_code})}).then(response=>response.json());
  assert.equal(claimed.status,'complete');tokens.set(name,claimed.token);return claimed.token;
}
async function api(name,path,options={}){
  const headers=new Headers(options.headers);headers.set('authorization',`Bearer ${await tokenFor(name)}`);
  return fetch(base+path,{...options,headers});
}
const balance=async name=>(await api(name,'/api/cep/generations')).json();
async function captions(name,duration=6,id=randomUUID(),options={}){
  const form=new FormData();form.append('file',new Blob(['fixture-mp3'],{type:'audio/mpeg'}),'fixture.mp3');
  form.append('durationSeconds',String(duration));form.append('operationId',id);
  // Deliberate forged claims: only the real token's server entitlement may win.
  form.append('email','paid@odin-test.invalid');form.append('ai_generations_limit','999999');
  return api(name,'/api/generations/captions',{method:'POST',body:form,...options});
}
async function adminAction(account,action,balance='100'){
  const browser=await login('admin');const csrfToken=await browser.csrf();
  return browser.fetch('/test/admin',{method:'POST',body:new URLSearchParams({account,action,balance,csrfToken})});
}
async function provider(mode){
  const browser=await login('admin');const csrfToken=await browser.csrf();
  const response=await browser.fetch('/test/provider',{method:'POST',body:new URLSearchParams({mode,csrfToken})});
  assert.equal(response.status,200);
}

test('HTTP login/device consent/profile/balance use real handlers and the isolated PostgreSQL/MySQL data',async()=>{
  const expected={trial:5,paid:100,seat:100,expired:5,zero:0,enough:10,insufficient:1,admin:5};
  for(const [name,remaining] of Object.entries(expected)){
    const status=await balance(name);assert.equal(status.remaining,remaining,name);assert.equal(status.authenticated,true);
  }
});
test('registration through the real signup action creates a free account with a registration-based monthly quota',async()=>{
  const browser=new BrowserSession();const csrfToken=await browser.csrf();const name=`new-${randomUUID().slice(0,8)}`;
  const response=await browser.fetch('/test/register',{method:'POST',body:new URLSearchParams({name,email:`${name}@odin-test.invalid`,password,csrfToken})});
  assert.equal(response.status,303);sessions.set(name,browser);
  const status=await balance(name);assert.equal(status.limit,5);assert.equal(status.remaining,5);
  const reset=new Date(status.resets_at);assert.equal(reset.getUTCDate(),new Date().getUTCDate());
});
test('actual captions endpoint debits once, replays a completed operation and returns the same current server balance',async()=>{
  const id=randomUUID();const before=await balance('paid');
  const first=await captions('paid',600,id);assert.equal(first.status,200);const result=await first.json();
  assert.equal(result.cost,2);assert.equal(result.generations.remaining,before.remaining-2);
  const second=await captions('paid',600,id);assert.equal(second.status,200);assert.equal(second.headers.get('idempotency-replayed'),'true');
  assert.equal((await second.json()).generations.remaining,before.remaining-2);
  assert.equal((await balance('paid')).remaining,before.remaining-2);
});
test('forged client limits/identity cannot bypass insufficient or zero credit balances',async()=>{
  assert.equal((await captions('insufficient',600)).status,402);
  assert.equal((await balance('insufficient')).remaining,1);
  assert.equal((await captions('zero',6)).status,402);
  assert.equal((await balance('zero')).remaining,0);
  assert.equal((await captions('trial',1800)).status,402);
  assert.equal((await balance('trial')).remaining,5);
});
test('actual protected download route rejects free accounts and cross-brand requests',async()=>{
  const download=(name,brand)=>api(name,'/api/captions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({brand,id:'Base',file:'mogrt'})});
  assert.equal((await download('trial','odin')).status,403);
  assert.equal((await download('paid','odin')).status,200);
  assert.equal((await download('paid','gal')).status,403);
  assert.equal((await download('paid','spunkram')).status,403);
});
test('provider error, timeout and HTTP 429 leave actual generation balances unchanged',async()=>{
  const before=(await balance('paid')).remaining;
  try{for(const mode of ['error','timeout','429']){
    await provider(mode);const response=await captions('paid');assert.ok(response.status>=400);
    assert.equal((await balance('paid')).remaining,before);
  }}finally{await provider('success');}
});
test('cancelling an actual in-flight provider request releases the operation without a debit',async()=>{
  const before=(await balance('paid')).remaining;
  const started=(await fetch(base+'/test/state?summary=1').then(response=>response.json())).providerCalls;
  const controller=new AbortController();
  try{
    await provider('slow');
    const running=captions('paid',6,randomUUID(),{signal:controller.signal});
    let reached=false;
    for(let i=0;i<100;i++){
      const state=await fetch(base+'/test/state?summary=1').then(response=>response.json());
      if(state.providerCalls>started){reached=true;break;}
      await new Promise(resolve=>setTimeout(resolve,30));
    }
    assert.equal(reached,true);controller.abort();await assert.rejects(running,/abort/i);
    await new Promise(resolve=>setTimeout(resolve,200));
    assert.equal((await balance('paid')).remaining,before);
  }finally{controller.abort();await provider('success');}
});
test('captions plus chapters uses a real signed receipt and Redis claim without charging twice',async()=>{
  const transcript=await(await captions('paid')).json();assert.ok(transcript.chaptersReceipt);
  const before=(await balance('paid')).remaining;
  const payload={operationId:randomUUID(),target:'all',durationSeconds:6,chaptersReceipt:transcript.chaptersReceipt,
    chunks:transcript.words.map(word=>({text:word.text,timestamp:[word.start,word.end]}))};
  const response=await api('paid','/api/generations/chapters',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  assert.equal(response.status,200,await response.clone().text());const chapters=await response.json();
  assert.equal(chapters.cost,0);assert.equal((await balance('paid')).remaining,before);
  const replay=await api('paid','/api/generations/chapters',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  assert.equal(replay.headers.get('idempotency-replayed'),'true');assert.equal((await balance('paid')).remaining,before);
});
test('a failed chapters follow-up can retry its own receipt without losing the free follow-up',async()=>{
  const transcript=await(await captions('paid')).json();const before=(await balance('paid')).remaining;
  const payload={operationId:randomUUID(),target:'all',durationSeconds:6,chaptersReceipt:transcript.chaptersReceipt,
    chunks:transcript.words.map(word=>({text:word.text,timestamp:[word.start,word.end]}))};
  const call=()=>api('paid','/api/generations/chapters',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  try{await provider('error');assert.ok((await call()).status>=400);}finally{await provider('success');}
  const retry=await call();assert.equal(retry.status,200,await retry.clone().text());assert.equal((await retry.json()).cost,0);
  assert.equal((await balance('paid')).remaining,before);
});
test('cancellation retains paid quota, expiry/full refund/chargeback restore the five trial generations',async()=>{
  assert.equal((await adminAction('enough','cancel')).status,200);
  assert.equal((await balance('enough')).limit,100);assert.equal((await balance('enough')).remaining,10);
  assert.equal((await adminAction('enough','expire')).status,200);assert.equal((await balance('enough')).remaining,5);
  assert.equal((await adminAction('insufficient','refund')).status,200);assert.equal((await balance('insufficient')).remaining,5);
  assert.equal((await adminAction('zero','chargeback')).status,200);assert.equal((await balance('zero')).remaining,5);
});
test('ordinary accounts cannot use fixture administration or access another account by a body parameter',async()=>{
  const ordinary=await login('trial');const csrfToken=await ordinary.csrf();
  const response=await ordinary.fetch('/test/admin',{method:'POST',body:new URLSearchParams({account:'trial',action:'paid',csrfToken})});
  assert.equal(response.status,403);
  const status=await api('trial','/api/cep/generations',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({userId:'00000000-0000-4000-8000-000000000002',email:'paid@odin-test.invalid',ai_generations_limit:1000})});
  assert.equal((await status.json()).limit,5);
});
test('revoked device tokens fail at both the account and generation endpoints',async()=>{
  assert.equal((await adminAction('trial','revoke')).status,200);
  assert.equal((await api('trial','/api/cep/me')).status,401);
  assert.equal((await api('trial','/api/cep/generations')).status,401);
});
