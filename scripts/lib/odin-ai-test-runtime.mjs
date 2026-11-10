import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileTestFixture } from './test-fixture-runtime.mjs';
import ts from 'typescript';
import mysql from 'mysql2/promise';

const require=createRequire(import.meta.url);
export function odinTestLoader(mocks={},globals={}) {
  const cache=new Map();
  function load(name,parent=import.meta.url) {
    if(name==='server-only')return {};
    if(Object.hasOwn(mocks,name))return mocks[name];
    if(!name.startsWith('@/')&&!name.startsWith('.'))return createRequire(parent)(name);
    const path=name.startsWith('@/')?`../../${name.slice(2)}`:name;
    const url=new URL(/\.(?:mjs|cjs|js|ts|tsx|json)$/.test(path)?path:`${path}.ts`,name.startsWith('@/')?import.meta.url:parent);
    if(url.pathname.endsWith('.json'))return require(fileURLToPath(url));
    if(cache.has(url.href))return cache.get(url.href).exports;
    const fixture=compileTestFixture(url,{replaceImportMetaUrl:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}});
    const module={exports:{}};cache.set(url.href,module);
    fixture.runModule({require:specifier=>load(specifier,url.href),module,exports:module.exports,...globals});
    return module.exports;
  }
  return load;
}

/** Never load a site's .env or accept a production database for these tests. */
export function createOdinTestPool() {
  const env={...process.env};
  if(env.ODIN_AI_TEST_ENV) {
    for(const line of readFileSync(env.ODIN_AI_TEST_ENV,'utf8').split(/\r?\n/)) {
      const match=/^(DB_[A-Z_]+)=(.*)$/.exec(line);if(match)env[match[1]]=match[2];
    }
  }
  if(!/^codex_odin_ai_test_[a-zA-Z0-9_]+$/.test(env.DB_DATABASE||'') || !['127.0.0.1','localhost'].includes(env.DB_HOST)) {
    throw new Error('Set ODIN_AI_TEST_ENV to an isolated localhost codex_odin_ai_test_* database. Production settings are refused.');
  }
  return mysql.createPool({host:env.DB_HOST,port:Number(env.DB_PORT||3306),user:env.DB_USERNAME,
    password:env.DB_PASSWORD,database:env.DB_DATABASE,connectionLimit:20,waitForConnections:true});
}

export async function applyOdinTestSchema(pool) {
  const sql=readFileSync(new URL('../../db/migrations/2026_11_10_odin_ai_period_usage.sql',import.meta.url),'utf8');
  for(const statement of sql.split(';').filter(value=>value.trim()))await pool.query(statement);
}
