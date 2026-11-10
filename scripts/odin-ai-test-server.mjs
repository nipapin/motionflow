import {createServer} from 'node:http';
import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createOdinTestPool,applyOdinTestSchema,odinTestLoader} from './lib/odin-ai-test-runtime.mjs';
import {createOdinDatabase,seedOdinAccounts,accounts} from '../../ione-premiere-basics/tests/cep/fixtures/odin.mjs';
import {sourceLoader} from '../../ione-premiere-basics/tests/cep/fixtures/load-source.mjs';

const fixturePassword='OdinFixture!2026';
const origin='http://127.0.0.1:13900';
const context=new AsyncLocalStorage();
const cookieApi={
  async cookies(){const ctx=context.getStore();if(!ctx)throw new Error('No test HTTP context');return{
    get:name=>ctx.cookies.has(name)?{value:ctx.cookies.get(name)}:undefined,
    set:(name,value,options={})=>{ctx.cookies.set(name,value);ctx.setCookies.push(`${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax${options.maxAge?`; Max-Age=${options.maxAge}`:''}`);},
    delete:name=>{ctx.cookies.delete(name);ctx.setCookies.push(`${name}=; Path=/; Max-Age=0`);},
  };},
  async headers(){return context.getStore().request.headers;},
};

export async function startOdinTestServer() {
  const mysql=createOdinTestPool();await applyOdinTestSchema(mysql);
  const require=createRequire(new URL('../../ione-premiere-basics/package.json',import.meta.url));
  const {Pool}=require('pg');const bcrypt=require('bcrypt');
  const {NextRequest}=require('next/server');
  if(!process.env.ODIN_PG_TEST_PASSWORD_FILE)throw new Error('ODIN_PG_TEST_PASSWORD_FILE must point to the isolated PostgreSQL test password');
  const pgOptions={host:'127.0.0.1',port:13932,user:'odin_test',password:readFileSync(process.env.ODIN_PG_TEST_PASSWORD_FILE,'utf8').trim()};
  const dbName='codex_odin_ai_test_20261110';
  const admin=new Pool({...pgOptions,database:'postgres',max:1});
  try{if(!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[dbName])).rowCount)await admin.query(`CREATE DATABASE ${dbName}`);}finally{await admin.end();}
  const pg=new Pool({...pgOptions,database:dbName,max:10});
  const selected=(await pg.query('SELECT current_database() AS name,current_user AS role')).rows[0];
  if(selected.name!==dbName||selected.role!=='odin_test')throw new Error('Refusing to reset a non-fixture PostgreSQL database');
  await pg.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  const db={query:(sql,args)=>pg.query(sql,args),exec:sql=>pg.query(sql),pool:pg,close:()=>pg.end()};
  const website=await seedOdinAccounts(await createOdinDatabase(undefined,db));
  await pg.query(`CREATE TABLE sessions(user_id uuid REFERENCES users(user_id),session_id text,ip_address text,user_agent text,
    created_at timestamptz,expires_at timestamptz,PRIMARY KEY(user_id,session_id))`);
  const password=await bcrypt.hash(fixturePassword,10);
  await pg.query('UPDATE users SET password=$1',[password]);
  await mysql.query('DELETE FROM odin_ai_operations');await mysql.query('DELETE FROM odin_ai_period_usage');
  process.env.NEXT_PUBLIC_APP_URL=origin;
  process.env.MOTIONFLOW_MANAGEMENT_ENABLED='true';
  process.env.MOTIONFLOW_MANAGEMENT_SECRET='isolated-odin-usage-management-secret';
  process.env.ODIN_MANAGEMENT_SECRET=process.env.MOTIONFLOW_MANAGEMENT_SECRET;
  process.env.MOTIONFLOW_AI_ORIGIN=origin;
  process.env.PAYPRO_VALIDATION_KEY='odin-isolated-webhook-key';
  process.env.PAYPRO_VENDOR_ACCOUNT_ID='1';process.env.PAYPRO_API_SECRET_KEY='isolated-provider-secret';
  process.env.REPLICATE_ODINPRO_API_TOKEN='isolated-replicate-key';
  process.env.CAPTIONS_CHAPTERS_RECEIPT_SECRET='isolated-caption-receipt-key';
  process.env.REDIS_HOST='127.0.0.1';process.env.REDIS_PORT=process.env.ODIN_REDIS_TEST_PORT||'13379';
  process.env.REDIS_PASSWORD='null';process.env.REDIS_DB='0';
  const orders=new Map();let providerMode='success';let providerCalls=0;
  const query=async(sql,args)=>(await pg.query(sql,args)).rows;
  const paypro=async(url,options)=>{
    if(String(url)===origin+'/api/integrations/odin/ai')return fetch(url,options);
    if(url==='https://api.get-atomx.com/atomx/v1/webhook_esubs')return Response.json({});
    const input=JSON.parse(options.body);
    if(url.endsWith('/Orders/GetOrderDetails'))return Response.json({isSuccess:true,response:orders.get(String(input.orderId))});
    if(url.endsWith('/Subscriptions/GetSubscriptionDetails'))return Response.json({isSuccess:true,response:{status:'Active',nextPayment:new Date(Date.now()+30*86400000).toISOString()}});
    throw new Error('Isolated test environment blocked an unexpected external request');
  };
  const site=sourceLoader({
    'next/headers':cookieApi,'@/app/database/pool':{pool:pg},'@/app/database/postgre':{query},
    '@/lib/cep-service':{cepAuth:website.auth},'@/lib/email':{sendEmail:async()=>{}},
    '@/lib/cep-market':{odinCatalog:async()=>({Packages:[]}),odinPackUrl:async()=>{throw new Error('No fixture pack configured');},odinDiffUrl:async()=>null},
  },{fetch:paypro});
  const sessions=site('@/lib/session'),csrf=site('@/lib/csrf'),users=site('@/actions/user');
  const cep=site('@/app/api/cep/[...path]/route');const payment=site('@/app/api/payment/route');
  const management=site('@/lib/odin-subscription-management').createOdinSubscriptionManagement(pg);
  const accountTransport=async(url,options)=>{
    if(url!=='https://odin-pro.com/api/cep/me?client=odin-cep')throw new Error('A real external service was blocked in the test environment');
    const identity=await website.auth.authenticate(options.headers.Authorization);
    return identity?Response.json(await website.auth.profile(identity)):Response.json({error:'UNAUTHORIZED'},{status:401});
  };
  class FixtureReplicate {
    async run(model,options={}) {
      providerCalls++;options.signal?.throwIfAborted();
      if(providerMode==='429'){const error=new Error('Too many requests');error.response={status:429};throw error;}
      if(providerMode==='timeout')throw new Error('Provider request timed out');
      if(providerMode==='error')throw new Error('Simulated external provider failure');
      await new Promise((resolve,reject)=>{
        const done=()=>{options.signal?.removeEventListener('abort',cancel);resolve();};
        const timer=setTimeout(done,providerMode==='slow'?2000:80);
        const cancel=()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));};
        options.signal?.addEventListener('abort',cancel,{once:true});
      });options.signal?.throwIfAborted();
      if(String(model).includes('scribe'))return{text:'Hello from the isolated Odin test environment.',language_code:'en',duration_seconds:6,
        words:['Hello','from','the','isolated','Odin','test','environment.'].map((text,i)=>({text,type:'word',start:i*.6,end:(i+1)*.6}))};
      let input;try{input=JSON.parse(options.input?.prompt);}catch{}
      if(input?.candidates?.length===9)return[JSON.stringify({
        reviews:input.candidates.map(row=>({candidate_id:row.id,click_score:4,angle:'Fixture angle',reason:'Fixture review'})),
        final_titles:input.candidates.slice(0,3).map(row=>({title:row.title,action:'keep',source_candidate_id:row.id,
          angle:'Fixture angle',hook:'Fixture hook',reason:'Fixture selection'})),selection_note:'Isolated provider fixture',
      })];
      return [JSON.stringify({titles:Array.from({length:9},(_,i)=>`Odin fixture title ${i+1}`),sections:[{topic:'Introduction',start_index:0},{topic:'Testing',start_index:2}],description:'An isolated fixture description.',tags:['odin','test']})];
    }
  }
  const captionsStorage={parseCaptionsBrand:value=>['gal','spunkram','odin'].includes(value)?value:'gal',
    buildCaptionsTree:async brand=>({brand,categories:[],master:{mogrt:false,aep:false}}),
    parseProjectFileKind:value=>['mogrt','aep','definition'].includes(value)?value:null,
    resolveProjectFile:async(brand,id,kind)=>({key:`${brand}/${id}`,filename:`fixture.${kind}`,bucket:'fixture'}),
    createR2ObjectWebStream:async()=>new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('isolated paid style fixture'));controller.close();}}),
    readR2ObjectBuffer:async()=>Buffer.from('{}'),mimeForFilename:()=> 'application/octet-stream',
  };
  const ai=odinTestLoader({'@/lib/db':{getPool:()=>mysql},replicate:FixtureReplicate,
    '@/lib/r2-storage':{uploadBufferToR2:async()=>({url:'https://isolated-audio.invalid/fixture.mp3'})},
    '@/lib/captions-catalog':captionsStorage,
  },{fetch:accountTransport});
  const routes={
    '/api/account/usage':site('@/app/api/account/usage/route'),
    '/api/integrations/odin/ai':ai('@/app/(main)/api/integrations/odin/ai/route'),
    '/api/cep/generations':ai('@/app/(main)/api/cep/generations/route'),
    '/api/generations/captions':ai('@/app/(main)/api/generations/captions/route'),
    '/api/generations/chapters':ai('@/app/(main)/api/generations/chapters/route'),
    '/api/generations/caption-highlights':ai('@/app/(main)/api/generations/caption-highlights/route'),
    '/api/captions':ai('@/app/(main)/api/captions/route'),
  };
  const aiService=ai('@/lib/odin-ai');
  for(const [name,used] of [['zero',100],['enough',90],['insufficient',99]]){
    const profile=await website.auth.profile({id:'fixture',user_id:accounts[name].id});
    await mysql.execute('INSERT INTO odin_ai_period_usage(user_id,period_id,used) VALUES(?,?,?)',
      [`odin:${accounts[name].id}`,profile.entitlements.ai.period_id,used]);
  }
  async function signedInUser(){const session=await sessions.validateSession();return session?(await pg.query('SELECT * FROM users WHERE user_id=$1',[session.user_id])).rows[0]:null;}
  const redirect=path=>new Response(null,{status:303,headers:{location:path}});
  const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
  async function page(request,message='') {
    const token=await csrf.generateCsrfToken();await csrf.setCsrfToken(token);const user=await signedInUser();
    const url=new URL(request.url);const code=url.searchParams.get('cep')||url.searchParams.get('code')||'';
    const names=Object.keys(accounts);
    return new Response(`<!doctype html><html><meta charset="utf-8"><title>Odin isolated test environment</title>
      <style>body{font:16px system-ui;max-width:1000px;margin:48px auto;background:#161819;color:#eee}input,select,button{font:inherit;padding:10px;margin:8px 8px 8px 0}form{padding:20px;border:1px solid #555;margin:20px 0}code{color:#aee}a{color:#9cf}td,th{text-align:left;padding:8px}table{border-collapse:collapse}</style>
      <h1>Odin isolated test environment</h1><p>Local fixture accounts · PostgreSQL + MySQL · Mock providers · No real payments</p>
      <p role="status">${escape(message)}</p>${user?`<p>Signed in: <strong>${escape(user.email)}</strong> ${user.is_admin?'(administrator)':''}</p>
      <form method="post" action="/test/logout"><button>Sign out</button></form>
      ${code?`<form method="post" action="/test/approve"><input type="hidden" name="code" value="${escape(code)}"><input type="hidden" name="csrfToken" value="${token}"><button>Approve extension sign-in</button></form>`:''}`:
      `<form method="post" action="/test/login"><h2>Sign in</h2><label>Fixture account <select id="fixtureAccount">${names.map(name=>`<option value="${name}@odin-test.invalid">${name}</option>`).join('')}</select></label><br>
      <label>Email <input name="email" id="email" value="trial@odin-test.invalid"></label><label>Password <input name="password" type="password" value="${fixturePassword}"></label>
      <input type="hidden" name="csrfToken" value="${token}"><input type="hidden" name="code" value="${escape(code)}"><button>Sign in</button></form>
      <form method="post" action="/test/register"><h2>Register a test account</h2><input name="name" placeholder="Name" required><input name="email" placeholder="name@odin-test.invalid" required><input name="password" type="password" value="${fixturePassword}"><input type="hidden" name="csrfToken" value="${token}"><button>Register</button></form>`}
      ${user?.is_admin?`<form method="post" action="/test/admin"><h2>Fixture administration</h2><select name="account">${names.filter(name=>name!=='admin').map(name=>`<option>${name}</option>`).join('')}</select>
      <select name="action"><option value="paid">Grant manual paid subscription</option><option value="cancel">Cancel renewal</option><option value="expire">Expire paid subscription</option><option value="refund">Full refund</option><option value="chargeback">Chargeback</option><option value="balance">Set fixture balance</option><option value="revoke">Revoke devices</option></select>
      <input name="balance" type="number" min="0" max="100" value="100"><input type="hidden" name="csrfToken" value="${token}"><button>Apply to fixture account</button></form>`:''}
      <p>Fixture password: <code>${fixturePassword}</code>. Test domains only. The production site is not used.</p>
      <script>document.querySelector('#fixtureAccount')?.addEventListener('change',e=>document.querySelector('#email').value=e.target.value)</script></html>`,{headers:{'content-type':'text/html;charset=utf-8'}});
  }
  async function handle(request) {
    const path=new URL(request.url).pathname;
    if(path==='/'||path==='/cep/login'||path==='/account'||path==='/pricing')return page(request);
    if(path==='/test/login'||path==='/test/register'){
      const form=await request.formData();const email=String(form.get('email')||'').trim().toLowerCase();
      if(!email.endsWith('@odin-test.invalid'))return Response.json({error:'Only isolated fixture emails are accepted'},{status:400});
      const user=path==='/test/register'?await users.create(String(form.get('name')),email,String(form.get('password')),String(form.get('csrfToken')))
        :await users.login(email,String(form.get('password')),String(form.get('csrfToken')));
      if(!user)return page(request,'Invalid fixture credentials');
      return redirect('/?'+new URLSearchParams(form.get('code')?{cep:String(form.get('code'))}:{}));
    }
    if(path==='/test/logout'){await users.logout();return redirect('/');}
    if(path==='/test/approve'){
      const form=await request.formData();if(!await csrf.validateCsrfToken(String(form.get('csrfToken'))))return Response.json({error:'CSRF'},{status:403});
      const user=await signedInUser();if(!user)return redirect('/');
      const result=await website.auth.confirm(String(form.get('code')),user.user_id,'approve');
      return page(request,result?'Extension sign-in approved. Return to Adobe.':'Code expired or already used.');
    }
    if(path==='/test/admin'){
      const form=await request.formData();const admin=await signedInUser();
      if(!admin?.is_admin||!await csrf.validateCsrfToken(String(form.get('csrfToken'))))return Response.json({error:'Forbidden'},{status:403});
      const account=accounts[String(form.get('account'))];if(!account)return Response.json({error:'Unknown fixture account'},{status:400});
      const action=String(form.get('action'));
      if(action==='paid')await management.change({user_id:account.id,actor:admin.email,action:'subscription_issue',reason:'Isolated fixture',
        expires_at:new Date(Date.now()+30*86400000).toISOString(),plan_name:'Odin fixture subscription',request_id:randomUUID()});
      else if(action==='cancel')await pg.query("UPDATE subscriptions SET status='cancelled',finished=true WHERE user_id=$1",[account.id]);
      else if(action==='expire')await pg.query("UPDATE subscriptions SET next_charge_date='2000-01-01',ai_paid_until='2000-01-01' WHERE user_id=$1",[account.id]);
      else if(action==='refund'||action==='chargeback'){
        const sub=(await pg.query("SELECT * FROM subscriptions WHERE user_id=$1 AND management_source='paypro' ORDER BY id DESC LIMIT 1",[account.id])).rows[0];
        if(!sub)return page(request,'This fixture has no provider subscription to refund.');
        const id=50000+Number(sub.id);const type=action==='refund'?'OrderRefunded':'OrderChargedBack';
        orders.set(String(id),{orderId:id,orderStatusName:action==='refund'?'Refunded':'ChargedBack',createdAt:new Date(sub.ai_last_paid_at).toISOString(),
          billingCurrencyCode:'USD',customer:{customerId:1,email:account.email},orderItems:[{orderItemId:id*10,productId:Number(sub.product_id),
            subscriptionId:Number(sub.subscription_id),billingPrice:20,billingPriceRefund:20,quantity:1,orderItemName:'Odin fixture subscription'}]});
        const fields={TEST_MODE:'0',IPN_TYPE_NAME:type,ORDER_ID:String(id),ORDER_ITEM_ID:String(id*10),PRODUCT_ID:String(sub.product_id),
          SUBSCRIPTION_ID:String(sub.subscription_id),CUSTOMER_EMAIL:account.email,CUSTOMER_ID:'1',ORDER_STATUS:orders.get(String(id)).orderStatusName,
          ORDER_TOTAL_AMOUNT:'20',PRODUCT_QUANTITY:'1',ORDER_ITEM_NAME:'Odin fixture subscription',IS_ON_TRIAL_PERIOD:'0',ORDER_CUSTOM_FIELDS:''};
        fields.SIGNATURE=createHash('sha256').update([fields.ORDER_ID,fields.ORDER_STATUS,fields.ORDER_TOTAL_AMOUNT,fields.CUSTOMER_EMAIL,
          process.env.PAYPRO_VALIDATION_KEY,fields.TEST_MODE,fields.IPN_TYPE_NAME].join('')).digest('hex');
        const response=await payment.POST(new Request(origin+'/api/payment',{method:'POST',body:new URLSearchParams(fields)}));
        if(!response.ok)return response;
      }else if(action==='balance'){
        const profile=await website.auth.profile({id:'fixture',user_id:account.id});const allocation=profile.entitlements.ai;const balance=Number(form.get('balance'));
        if(!Number.isSafeInteger(balance)||balance<0||balance>allocation.limit)return Response.json({error:'Invalid fixture balance'},{status:400});
        await mysql.execute('INSERT INTO odin_ai_period_usage(user_id,period_id,used) VALUES(?,?,?) ON DUPLICATE KEY UPDATE used=VALUES(used)',
          [`odin:${account.id}`,allocation.period_id,allocation.limit-balance]);
      }else if(action==='revoke')await pg.query('UPDATE odin_cep_devices SET revoked_at=NOW() WHERE user_id=$1',[account.id]);
      else return Response.json({error:'Unknown fixture action'},{status:400});
      return page(request,'Fixture account updated.');
    }
    if(path==='/test/state'){
      if(new URL(request.url).searchParams.has('summary'))return Response.json({providerCalls,providerMode});
      const result=[];for(const account of Object.values(accounts)){
        const profile=await website.auth.profile({id:'fixture',user_id:account.id});
        const fakeUser={id:`odin:${account.id}`,source:'odin-bearer',odinAi:profile.entitlements.ai,
          odinSubscriptionActive:profile.subscription.active,odinSubscriptionExpiresAt:profile.subscription.renews_at};
        result.push({name:account.name,email:account.email,admin:account.admin,subscription:profile.subscription,...await aiService.odinAiStatus(fakeUser)});
      }
      return Response.json({accounts:result,providerCalls,providerMode});
    }
    if(path==='/test/provider'&&request.method==='POST'){
      const form=await request.formData();const user=await signedInUser();
      if(!user?.is_admin||!await csrf.validateCsrfToken(String(form.get('csrfToken'))))return Response.json({error:'Forbidden'},{status:403});
      const mode=String(form.get('mode'));if(!['success','error','timeout','429','slow'].includes(mode))return Response.json({error:'Invalid mode'},{status:400});
      providerMode=mode;return Response.json({providerMode});
    }
    if(path==='/api/cep/permissions')return Response.json({client:'odin-cep',permissions:{admin:false,developer:false}});
    if(path==='/api/cep/update')return Response.json({update:false,available:false});
    if(routes[path])return routes[path][request.method](request);
    if(path.startsWith('/api/cep/')){
      const response=await cep[request.method](request,{params:Promise.resolve({path:path.slice('/api/cep/'.length).split('/')})});
      if(path==='/api/cep/me'&&response.ok){const data=await response.json();data.subscribe_url=origin+'/pricing';data.manage_subscription_url=origin+'/account';return Response.json(data);}
      return response;
    }
    return Response.json({error:'Fixture route not found'},{status:404});
  }
  const server=createServer(async(incoming,outgoing)=>{
    const controller=new AbortController();outgoing.on('close',()=>{if(!outgoing.writableEnded)controller.abort();});
    try{
      const chunks=[];for await(const chunk of incoming)chunks.push(chunk);const body=Buffer.concat(chunks);
      const request=new NextRequest(origin+incoming.url,{method:incoming.method,headers:incoming.headers,
        ...(body.length?{body}:{}),signal:controller.signal});
      const cookies=new Map((incoming.headers.cookie||'').split(';').map(value=>value.trim().split(/=(.*)/s)).filter(value=>value[0]).map(([key,value])=>[key,decodeURIComponent(value||'')]));
      const state={request,cookies,setCookies:[]};
      const response=request.method==='OPTIONS'?new Response(null,{status:204}):await context.run(state,()=>handle(request));
      response.headers.set('Access-Control-Allow-Origin',incoming.headers.origin||'*');response.headers.set('Access-Control-Allow-Credentials','true');
      response.headers.set('Access-Control-Allow-Headers','Content-Type, Authorization, Idempotency-Key');response.headers.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');
      outgoing.writeHead(response.status,{...Object.fromEntries(response.headers),...(state.setCookies.length?{'set-cookie':state.setCookies}:{})});
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    }catch(error){console.error('[odin-test]',error.message);if(!outgoing.headersSent)outgoing.writeHead(500,{'Content-Type':'application/json'});outgoing.end(JSON.stringify({error:'Isolated test request failed'}));}
  });
  await new Promise(resolve=>server.listen(13900,'127.0.0.1',resolve));
  console.log(`Isolated Odin test environment ready at ${origin}. Fixture password: ${fixturePassword}`);
  return {origin,server,website,mysql,close:async()=>{await new Promise(resolve=>server.close(resolve));
    await ai('@/lib/redis').getRedis().quit().catch(()=>{});await mysql.end();await pg.end();}};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  startOdinTestServer().then(app=>{
    const close=()=>app.close().then(()=>process.exit(0));process.once('SIGINT',close);process.once('SIGTERM',close);
  }).catch(error=>{console.error('[odin-test]',error.message);process.exitCode=1;});
}
