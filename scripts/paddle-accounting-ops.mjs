// Fixed production operations. No arbitrary remote command or historical backfill.
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const [operation, expectedNext, expectedLaravel] = process.argv.slice(2);
assert(['inspect','backup','prepare','verify','enable','status','disable'].includes(operation));
assert.equal(process.platform,'linux');
const next = await fs.realpath('/root/motionflow-deploy/current');
const laravel = await fs.realpath('/var/www/motionflow_p_usr/data/www/motionflow.pro');
assert(next.startsWith('/root/motionflow-deploy/releases/'));
assert(laravel.startsWith('/var/www/motionflow_p_usr/data/www/laravel-ci-deploy/releases/'));
const backups = '/root/motionflow-accounting-backups';
const opsRoot=path.dirname(fileURLToPath(import.meta.url));
const metadata = async root => JSON.parse(await fs.readFile(path.join(root,'release.json'),'utf8'));
const releases = { next: await metadata(next), laravel: await metadata(laravel) };
process.loadEnvFile(path.join(next,'.env'));
const require = createRequire(path.join(next,'package.json'));
const mysql = require('mysql2/promise');
const db = await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT??3306),
  user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database:process.env.DB_DATABASE,dateStrings:true});
const run = (cmd,args,options={}) => execFileSync(cmd,args,{encoding:'utf8',maxBuffer:20*1024*1024,...options});
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
async function hashFile(file) {
  const {createReadStream}=await import('node:fs'); const h=crypto.createHash('sha256');
  for await(const chunk of createReadStream(file)) h.update(chunk); return h.digest('hex');
}
async function backupPath() {
  const root = await fs.realpath(path.join(backups,'latest'));
  assert(root.startsWith(backups+'/'));
  const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
  assert.equal(manifest.task,'paddle-actual-v2');
  for(const [file,digest] of Object.entries(manifest.files)) assert.equal(await hashFile(path.join(root,file)),digest,`Backup checksum: ${file}`);
  return root;
}
async function settings() {
  const [tables]=await db.query("SHOW TABLES LIKE 'paddle_accounting_settings'");
  return tables.length ? (await db.query('SELECT * FROM paddle_accounting_settings WHERE id=1'))[0][0] : null;
}
async function invariants() {
  // Fingerprint historical financial rows, without updating or exporting PII.
  const result={};
  for(const table of ['sold_items','subscription_payments','subscription_systems','users']) {
    const [[{maxId}]]=await db.query(`SELECT COALESCE(MAX(id),0) AS maxId FROM ${table}`);
    const [rows]=await db.query(`SELECT ${table==='users'?'id,balance':'*'} FROM ${table} WHERE id<=? ORDER BY id`,[maxId]);
    result[table]={maxId,count:rows.length,hash:hash(JSON.stringify(rows))};
  }
  return result;
}
async function checkExpected() {
  assert.match(expectedNext??'',/^[a-f0-9]{40}$/); assert.match(expectedLaravel??'',/^[a-f0-9]{40}$/);
  assert.equal(releases.next.commit,expectedNext,'Unexpected deployed Next');
  assert.equal(releases.laravel.commit,expectedLaravel,'Unexpected deployed Laravel');
  await backupPath();
}
async function writeEnv(file,values) {
  file=await fs.realpath(file); const stat=await fs.stat(file);
  let text=await fs.readFile(file,'utf8');
  for(const [key,value] of Object.entries(values)) {
    assert.match(key,/^[A-Z0-9_]+$/); assert(!/[\r\n]/.test(value));
    const line=key+'='+value,pattern=new RegExp('^'+key+'=.*$','m');
    text=pattern.test(text)?text.replace(pattern,()=>line):text.trimEnd()+'\n'+line+'\n';
  }
  const temporary=file+'.accounting-new';
  await fs.writeFile(temporary,text,{mode:stat.mode&0o777});
  await fs.chown(temporary,stat.uid,stat.gid); await fs.rename(temporary,file);
}
async function health() {
  for(const [url,release,host] of [['http://127.0.0.1:3000/api/deploy-health',releases.next.releaseId],
    ['http://127.0.0.1:81/deploy-health.php',releases.laravel.releaseId,'motionflow.pro']]) {
    const response=await fetch(url,{headers:host?{Host:host}:{},signal:AbortSignal.timeout(15000)});
    assert(response.ok); const body=await response.json(); if(host) assert.equal(body.booted,true); else assert.equal(body.status,'ok');
    assert.equal(body.release,release);assert.equal(body.database,true);assert.equal(body.redis,true);
  }
  console.log('Both release health checks passed.');
}
async function worker() {
  const p=JSON.parse(run('pm2',['jlist'])).find(p=>p.name==='motionflow-accounting');
  assert.equal(p?.pm2_env.status,'online');assert.equal(p.pm2_env.pm_cwd,next);
  const [[s]]=await db.query('SELECT TIMESTAMPDIFF(SECOND,worker_heartbeat_at,UTC_TIMESTAMP()) AS age FROM paddle_accounting_settings WHERE id=1');
  assert(s.age!==null && Number(s.age)<=180,'Accounting worker heartbeat is stale');
}
try {
  console.log(JSON.stringify({operation,releases,node:process.version,php:run('php',['-r','echo PHP_VERSION;']),settings:await settings()},null,2));
  if(operation==='inspect') {
    console.log(run('df',['-h','/root','/var/www']));
    console.log(run('du',['-sh',next,laravel]));
    const [engines]=await db.query('SELECT ENGINE,COUNT(*) AS tables_count,ROUND(SUM(DATA_LENGTH+INDEX_LENGTH)/1024/1024) AS size_mb FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() GROUP BY ENGINE');
    const [migrations]=await db.query('SELECT migration,batch FROM migrations ORDER BY id DESC LIMIT 12');
    const pm=JSON.parse(run('pm2',['jlist'])).map(p=>({name:p.name,status:p.pm2_env.status,cwd:p.pm2_env.pm_cwd}));
    const configured=Object.fromEntries(['PADDLE_API_KEY','PADDLE_WEBHOOK_SECRET','SPUNKRAM_PADDLE_API_KEY','SPUNKRAM_PADDLE_WEBHOOK_SECRET',
      'NEXT_PUBLIC_PADDLE_ENVIRONMENT','NEXT_PUBLIC_SPUNKRAM_PADDLE_ENVIRONMENT','NEXT_PUBLIC_PADDLE_PRICE_CREATOR_MONTHLY',
      'NEXT_PUBLIC_PADDLE_PRICE_CREATOR_YEARLY','NEXT_PUBLIC_PADDLE_PRICE_CREATOR_AI_MONTHLY','NEXT_PUBLIC_PADDLE_PRICE_CREATOR_AI_YEARLY']
      .map(k=>[k,k.endsWith('ENVIRONMENT')?process.env[k]:Boolean(process.env[k])]));
    console.log(JSON.stringify({engines,migrations,pm,configured},null,2));
    console.log(run('php',['artisan','migrate:status','--no-ansi'],{cwd:laravel}));
    console.log('dump utility:',run('sh',['-c','command -v mysqldump || command -v mariadb-dump']).trim());
    try {console.log('Local administrative MySQL access:',run('mysql',['--user=root','--protocol=socket','--batch','--skip-column-names','-e','SELECT 1']).trim()==='1');}catch {console.log('Local administrative MySQL access: unavailable');}
    for(const entry of await fs.readdir(backups).catch(()=>[])) {
      if(entry==='latest')continue;
      const error=await fs.readFile(path.join(backups,entry,'dump-errors.txt'),'utf8').catch(()=>'');
      if(error)console.log('Prior backup diagnostic:',entry,error.replaceAll(process.env.DB_PASSWORD??'never-match-empty','[redacted]'));
    }
  } else if(operation==='backup') {
    assert.equal(await settings(),null,'Existing accounting activation requires a fresh reviewed backup procedure');
    await fs.mkdir(backups,{recursive:true,mode:0o700});
    const root=path.join(backups,new Date().toISOString().replaceAll(':','-'));
    await fs.mkdir(root,{mode:0o700});
    await fs.copyFile(await fs.realpath(path.join(next,'.env')),path.join(root,'next.env'));
    await fs.copyFile(await fs.realpath(path.join(laravel,'.env')),path.join(root,'laravel.env'));
    await fs.writeFile(path.join(root,'pm2.json'),run('pm2',['jlist']),{mode:0o600});
    console.log('Saving code archives and consistent database snapshot to',root);
    run('tar',['-czf',path.join(root,'next.tgz'),'-C',next,'.'],{timeout:15*60*1000});
    run('tar',['-czf',path.join(root,'laravel.tgz'),'-C',laravel,'.'],{timeout:15*60*1000});
    let access;
    try {run('mysql',['--user=root','--protocol=socket','--batch','--skip-column-names','-e','SELECT 1'],{stdio:['ignore','pipe','pipe']});access=['--user=root','--protocol=socket'];}
    catch {access=['-h',process.env.DB_HOST,'-P',process.env.DB_PORT??'3306','-u',process.env.DB_USERNAME];}
    const sql=spawn('mysqldump',['--single-transaction','--quick','--no-tablespaces','--hex-blob','--routines','--triggers','--events',
      ...access,process.env.DB_DATABASE],
      {env:{...process.env,...(access[0]==='--user=root'?{MYSQL_PWD:''}:{MYSQL_PWD:process.env.DB_PASSWORD})},stdio:['ignore','pipe','pipe']});
    let errors=''; sql.stderr.on('data',chunk=>errors+=chunk);
    const gzip=spawn('gzip',['-c'],{stdio:['pipe','pipe','inherit']});
    const exit = child=>new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Snapshot command failed; inspect private server log')));});
    await Promise.all([pipeline(sql.stdout,gzip.stdin),pipeline(gzip.stdout,createWriteStream(path.join(root,'database.sql.gz'),{mode:0o600})),exit(sql),exit(gzip)]).catch(async e=>{await fs.writeFile(path.join(root,'dump-errors.txt'),errors,{mode:0o600});throw e;});
    run('gzip',['-t',path.join(root,'database.sql.gz')]);
    for(const file of ['next.tgz','laravel.tgz']) run('tar',['-tzf',path.join(root,file)],{maxBuffer:40*1024*1024});
    const files={}; for(const file of ['next.env','laravel.env','pm2.json','next.tgz','laravel.tgz','database.sql.gz']) files[file]=await hashFile(path.join(root,file));
    const manifest={task:'paddle-actual-v2',createdAt:new Date().toISOString(),releases,files,historical:await invariants()};
    await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
    await fs.symlink(root,path.join(backups,'latest'));
    console.log('VERIFIED SERVER BACKUP:',root); console.log(run('du',['-sh',root]));
  } else if(operation==='status') {
    console.log(run('node',['scripts/paddle-accounting.mjs','status'],{cwd:next}));
    console.log(JSON.stringify(JSON.parse(run('pm2',['jlist'])).map(p=>({name:p.name,status:p.pm2_env.status,cwd:p.pm2_env.pm_cwd})),null,2));
  } else if(operation==='disable') {
    console.log(run('node',['scripts/paddle-accounting.mjs','disable'],{cwd:next}));
  } else if(operation==='prepare') {
    await checkExpected();
    const s=await settings(); assert(s && !s.accept_new && !s.enabled_from,'Accounting must remain disabled during preparation');
    const [[{count}]]=await db.query('SELECT COUNT(*) AS count FROM paddle_accounting_transactions'); assert.equal(Number(count),0);
    const laravelSecrets={},nextValues={};
    const bootstrap=JSON.parse(await fs.readFile(path.join(opsRoot,'bootstrap.json'),'utf8').catch(()=>'{}'));
    if(!process.env.SPUNKRAM_PADDLE_API_KEY && bootstrap.spunkramKey) {
      process.env.SPUNKRAM_PADDLE_API_KEY=bootstrap.spunkramKey;
      process.env.NEXT_PUBLIC_SPUNKRAM_PADDLE_ENVIRONMENT='sandbox';
      nextValues.SPUNKRAM_PADDLE_API_KEY=bootstrap.spunkramKey;
      nextValues.NEXT_PUBLIC_SPUNKRAM_PADDLE_ENVIRONMENT='sandbox';
    }
    for(const account of ['default','spunkram']) {
      const prefix=account==='default'?'':'SPUNKRAM_';
      const key=process.env[prefix+'PADDLE_API_KEY']; if(!key) continue;
      const environment=process.env['NEXT_PUBLIC_'+prefix+'PADDLE_ENVIRONMENT']??'sandbox';
      const response=await fetch((environment==='production'?'https://api.paddle.com':'https://sandbox-api.paddle.com')+'/notification-settings',
        {headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(15000)});
      assert(response.ok,'Cannot read Paddle destination configuration'); const body=await response.json();
      await fs.writeFile(path.join(await backupPath(),account+'-notification-settings.json'),JSON.stringify(body,null,2),{mode:0o600});
      const candidates=body.data.filter(d=>{try {const u=new URL(d.destination);return u.hostname.endsWith('motionflow.pro')&&u.pathname==='/webhook/paddle';} catch{return false;}});
      const dest=candidates.find(d=>d.active)||candidates[0];
      assert(dest?.endpoint_secret_key,'Laravel Paddle destination secret unavailable');
      laravelSecrets[account==='default'?'PADDLE_ACCOUNTING_DEFAULT_WEBHOOK_SECRET':'PADDLE_ACCOUNTING_SPUNKRAM_WEBHOOK_SECRET']=dest.endpoint_secret_key;
      laravelSecrets['NEXT_PUBLIC_'+prefix+'PADDLE_ENVIRONMENT']=environment;
      console.log('Laravel destination verified:',account,environment,dest.id,'active='+dest.active);
    }
    const secret=process.env.PADDLE_ACCOUNTING_BRIDGE_SECRET??crypto.randomBytes(48).toString('hex'); assert(secret.length>=32);
    const values={PADDLE_ACCOUNTING_BRIDGE_SECRET:secret};
    for(const type of ['CREATOR_MONTHLY','CREATOR_YEARLY','CREATOR_AI_MONTHLY','CREATOR_AI_YEARLY']) {
      const key='NEXT_PUBLIC_PADDLE_PRICE_'+type;assert(process.env[key]);laravelSecrets[key]=process.env[key];
    }
    await writeEnv(path.join(next,'.env'),{...values,...nextValues});
    await writeEnv(path.join(laravel,'.env'),{...values,...laravelSecrets,PADDLE_ACCOUNTING_BRIDGE_URL:'http://127.0.0.1:3000/api/internal/paddle-accounting'});
    run('runuser',['-u','motionflow_p_usr','--','php',path.join(laravel,'artisan'),'config:cache'],{cwd:laravel});
    run('pm2',['restart','motionflow']);
    if(JSON.parse(run('pm2',['jlist'])).some(p=>p.name==='motionflow-accounting')) run('pm2',['delete','motionflow-accounting']);
    console.log(run('pm2',['start',path.join(next,'deploy/paddle-accounting-worker.config.cjs')])); run('pm2',['save']);
    console.log('Bridge configured; worker started; new accounting is still disabled.');
  } else if(operation==='verify') {
    await checkExpected(); await health(); await worker();
    const s=await settings();assert(!s.accept_new && !s.enabled_from,'Run preactivation checks with accounting disabled');
    for(const file of ['app/Services/PaddleActualAccounting.php','config/paddle_accounting.php',
      'app/Http/Controllers/Checkout/PaymentServices/GatewayPaddle.php','app/Http/Controllers/Contributor/Earnings.php',
      'database/migrations/2026_10_21_000000_create_paddle_actual_accounting.php']) console.log(run('php',['-l',path.join(laravel,file)]).trim());
    console.log(run('runuser',['-u','motionflow_p_usr','--','php',path.join(laravel,'artisan'),'view:cache'],{cwd:laravel}));
    const before=await invariants();
    console.log(run('node',['--test','--test-reporter=spec','--test-concurrency=1','scripts/test-paddle-accounting.mjs'],{cwd:next,timeout:180000,
      env:{...process.env,NODE_PATH:path.join(opsRoot,'node_modules'),PADDLE_ACCOUNTING_TEST_MYSQL:'1',PADDLE_ACCOUNTING_LARAVEL_ROOT:laravel}}));
    const unauthorized=await fetch('http://127.0.0.1:3000/api/internal/paddle-accounting',{method:'POST',body:'{}'});assert.equal(unauthorized.status,401);
    const php=`<?php
    require $argv[1].'/vendor/autoload.php';
    $app=require $argv[1].'/bootstrap/app.php';$app->make(Illuminate\\Contracts\\Console\\Kernel::class)->bootstrap();
    $db=Illuminate\\Support\\Facades\\DB::connection();
    $db->statement('CREATE TEMPORARY TABLE paddle_accounting_settings LIKE paddle_accounting_settings');
    $db->statement('CREATE TEMPORARY TABLE paddle_accounting_transactions LIKE paddle_accounting_transactions');
    $db->statement("INSERT INTO paddle_accounting_settings (id,accept_new,enabled_from) VALUES (1,1,'1969-01-01')");
    if(App\\Services\\PaddleActualAccounting::entriesForUser(0)!==[]) throw new RuntimeException('Cabinet leaked other users');
    foreach(config('paddle_accounting.sources') as $source) {
      if(empty($source['secret'])) continue;
      $event=['event_type'=>'transaction.completed','data'=>['id'=>'txn_accounting_smoke','created_at'=>'1970-01-01T00:00:00Z','items'=>[]]];
      $raw=json_encode($event);$ts=(string)time();$sig=hash_hmac('sha256',$ts.':'.$raw,$source['secret']);
      $request=Illuminate\\Http\\Request::create('/webhook/paddle','POST',[],[],[],['CONTENT_TYPE'=>'application/json','HTTP_PADDLE_SIGNATURE'=>'ts='.$ts.';h1='.$sig],$raw);
      if(App\\Services\\PaddleActualAccounting::forwardIfApplicable($request,$event)!==false) throw new RuntimeException('Historical smoke event should be excluded');
      $request->headers->set('Paddle-Signature','ts='.$ts.';h1='.str_repeat('0',64));
      try {App\\Services\\PaddleActualAccounting::forwardIfApplicable($request,$event);throw new RuntimeException('Invalid signature accepted');}
      catch(Symfony\\Component\\HttpKernel\\Exception\\HttpException $e) {if($e->getStatusCode()!==401)throw $e;}
    }
    $html=view('market.contributor.inc.paddle-actual-earnings',['paddle_actual_entries'=>[(object)['id'=>'test','transaction_id'=>'txn_smoke','currency_code'=>'USD','amount_minor'=>123,'status'=>'posted','created_at'=>'2026-01-01 00:00:00','adjustment_id'=>null]]])->render();
    if(!str_contains($html,'1.23')) throw new RuntimeException('Blade earnings table did not render');
    echo "Native PHP bridge, original signatures, historical exclusion and cabinet passed.\\n";
    `;
    const smoke=path.join(opsRoot,'smoke.php');await fs.writeFile(smoke,php,{mode:0o600});console.log(run('php',[smoke,laravel],{cwd:laravel,timeout:90000}));
    assert.deepEqual(await invariants(),before,'Historical rows changed during preactivation checks');
    const [[{count}]]=await db.query('SELECT COUNT(*) AS count FROM paddle_accounting_transactions');assert.equal(Number(count),0);
    await fs.writeFile(path.join(await backupPath(),'preflight.json'),JSON.stringify({passedAt:Date.now(),releases,historical:before},null,2),{mode:0o600});
    console.log('PREACTIVATION CHECKS PASSED. Historical financial rows and balances were not modified by tests.');
  } else if(operation==='enable') {
    await checkExpected(); await health(); await worker();
    const root=await backupPath(),preflight=JSON.parse(await fs.readFile(path.join(root,'preflight.json'),'utf8'));
    assert(Date.now()-preflight.passedAt<30*60*1000,'Repeat preactivation verification');assert.deepEqual(preflight.releases,releases);
    const before=await invariants();
    console.log(run('node',['scripts/paddle-accounting.mjs','enable'],{cwd:next}));
    assert.deepEqual(await invariants(),before,'Activation changed historical financial rows');
    await fs.writeFile(path.join(root,'activation.json'),JSON.stringify({activatedAt:new Date().toISOString(),releases,settings:await settings()},null,2),{mode:0o600});
    await health();console.log('ACTIVATED. Original site subscriptions and historical charges retain their existing calculation.');
  }
} finally {await db.end();if(operation==='prepare')await fs.rm(path.join(opsRoot,'bootstrap.json'),{force:true});}
