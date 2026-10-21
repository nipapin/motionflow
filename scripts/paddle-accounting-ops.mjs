// Fixed production operations. No arbitrary remote command or historical backfill.
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import assert from 'node:assert/strict';

const [operation, expectedNext, expectedLaravel] = process.argv.slice(2);
assert(['inspect','backup','prepare','verify','enable','status','disable'].includes(operation));
assert.equal(process.platform,'linux');
const next = await fs.realpath('/root/motionflow-deploy/current');
const laravel = await fs.realpath('/var/www/motionflow_p_usr/data/www/motionflow.pro');
assert(next.startsWith('/root/motionflow-deploy/releases/'));
assert(laravel.startsWith('/var/www/motionflow_p_usr/data/www/laravel-ci-deploy/releases/'));
const backups = '/root/motionflow-accounting-backups';
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
  for(const table of ['sold_items','subscription_payments']) {
    const [[{maxId}]]=await db.query(`SELECT COALESCE(MAX(id),0) AS maxId FROM ${table}`);
    const [rows]=await db.query(`SELECT * FROM ${table} WHERE id<=? ORDER BY id`,[maxId]);
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
    const sql=spawn('mysqldump',['--single-transaction','--quick','--no-tablespaces','--hex-blob','--routines','--triggers','--events',
      '-h',process.env.DB_HOST,'-P',process.env.DB_PORT??'3306','-u',process.env.DB_USERNAME,process.env.DB_DATABASE],
      {env:{...process.env,MYSQL_PWD:process.env.DB_PASSWORD},stdio:['ignore','pipe','pipe']});
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
  } else {
    await checkExpected();
    throw new Error('Preparation and activation require the verified deployment implementation');
  }
} finally {await db.end();}
