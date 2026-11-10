import {test} from 'node:test';
import assert from 'node:assert/strict';
const origin='http://127.0.0.1:13900';
class Session {
  cookies=new Map();
  async fetch(path,options={}){
    const headers=new Headers(options.headers);headers.set('user-agent','Odin-Usage-E2E');headers.set('origin',origin);
    headers.set('cookie',[...this.cookies].map(([name,value])=>`${name}=${value}`).join('; '));
    const response=await fetch(origin+path,{...options,headers,redirect:'manual'});
    for(const cookie of response.headers.getSetCookie()){
      const [pair]=cookie.split(';');const split=pair.indexOf('=');this.cookies.set(pair.slice(0,split),pair.slice(split+1));
    }
    return response;
  }
  async login(name){
    await this.fetch('/');const csrfToken=this.cookies.get('csrf_token');
    const response=await this.fetch('/test/login',{method:'POST',body:new URLSearchParams({
      email:`${name}@odin-test.invalid`,password:'OdinFixture!2026',csrfToken})});
    assert.equal(response.status,303);
  }
}
test('the actual website API requires a complete session, ignores foreign identity claims and returns private Usage',async()=>{
  assert.equal((await fetch(origin+'/api/account/usage')).status,401);
  const paid=new Session();await paid.login('paid');
  const owner=await paid.fetch('/api/account/usage');assert.equal(owner.status,200);
  assert.equal(owner.headers.get('cache-control'),'private, no-store');
  const ownerData=await owner.json();assert.equal(ownerData.balance.limit,100);
  const trial=new Session();await trial.login('trial');
  const response=await trial.fetch('/api/account/usage?userId='+ownerData.accountId+'&limit=999&email=paid@odin-test.invalid');
  assert.equal(response.status,200);const data=await response.json();
  assert.notEqual(data.accountId,ownerData.accountId);assert.equal(data.balance.limit,5);
  assert.equal('response_body' in data,false);assert.equal('profile' in data,false);
  assert.equal((await trial.fetch('/api/account/usage?page=-1')).status,400);
  const forged=new Session();forged.cookies.set('odin-pro-session',ownerData.accountId);
  assert.equal((await forged.fetch('/api/account/usage')).status,401);
});
