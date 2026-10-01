import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import env from '@next/env';
import mysql from 'mysql2/promise';
import ts from 'typescript';
import { HeadObjectCommand } from '@aws-sdk/client-s3';

// Defaults to a read-only plan. --apply binds the four validated releases and
// preserves the existing full-pack identities. Does not enable the Odin site flag.
env.loadEnvConfig(process.cwd());
const apply = process.argv.includes('--apply');
const envArg = process.argv.find(arg => arg.startsWith('--env-file='));
const envFile = path.resolve(envArg?.slice('--env-file='.length) || '.env.local');
const require = createRequire(import.meta.url), cache = new Map();
function load(name) {
  if (name === 'server-only') return {};
  if (!name.startsWith('@/')) return require(name);
  if (cache.has(name)) return cache.get(name);
  const code = ts.transpileModule(fs.readFileSync(path.resolve(name.slice(2) + '.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} }; cache.set(name, module.exports);
  new Function('require', 'module', 'exports', code)(load, module, module.exports);
  return module.exports;
}
const authorId = 900000001;
const releases = [
  { id: 283, host: 'AE', version: '1.2.0', key: 'odin-pro-ae.zip' },
  { id: 275, host: 'PR', version: '1.2.0', key: 'odin-pro-pr.zip' },
  { id: 900000003, host: 'AE', version: 'DEMO', key: 'odin-pro-ae-free.zip' },
  { id: 900000004, host: 'PR', version: 'DEMO', key: 'odin-pro-pr-free.zip' },
];
const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE, connectTimeout: 10000 });
let transaction = false, originalEnv;
try {
  const [authors] = await db.execute('SELECT id,slug,r2_bucket FROM packages_authors WHERE id=?', [authorId]);
  const row = authors[0];
  if (row?.slug !== 'odin' || row.r2_bucket !== 'motionflow-odin') throw Error('Unexpected Odin author or bucket');
  const author = { id: authorId, slug: 'odin', r2Bucket: row.r2_bucket };
  const { loadPackStructureFromR2 } = load('@/lib/packages-pack-structure');
  const { getR2Client } = load('@/lib/r2-storage');
  for (const release of releases) {
    await getR2Client().send(new HeadObjectCommand({ Bucket: row.r2_bucket, Key: release.key }));
    const result = await loadPackStructureFromR2({ author, project: { id: release.id, name: 'Odin Pro', version: release.version, downloadKey: release.key } });
    if (!result.ok || result.settings.main?.software_id !== release.host || result.version !== release.version || !Object.keys(result.content).length) throw Error('Invalid release: ' + release.key);
    release.name = result.settings.main.name;
    if (typeof release.name !== 'string' || !release.name.trim()) throw Error('Missing pack name');
  }
  if (apply) { await db.beginTransaction(); transaction = true; }
  const [projects] = await db.execute('SELECT * FROM packages_projects WHERE author_id=? AND deleted_at IS NULL' + (apply ? ' FOR UPDATE' : ''), [authorId]);
  const mapping = {};
  const plan = [];
  for (const release of releases) {
    const matches = projects.filter(p => p.host === release.host && (String(p.version).trim().toUpperCase() === 'DEMO') === (release.version === 'DEMO'));
    if (matches.length > 1) throw Error('Ambiguous Odin projects: ' + release.key);
    const existing = matches[0];
    plan.push({ ...release, project: existing?.id ?? 'new' });
  }
  if (!apply) { console.log(JSON.stringify({ apply: false, releases: plan })); }
  else {
    const backup = path.resolve('.cache/odin-connect-' + new Date().toISOString().replace(/[:.]/g, '-'));
    fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(backup, 'projects.before.json'), JSON.stringify(projects, null, 2), { mode: 0o600 });
    originalEnv = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
    fs.writeFileSync(path.join(backup, 'env.before'), originalEnv, { mode: 0o600 });
    for (const release of plan) {
      let project = release.project;
      if (project === 'new') {
        const [result] = await db.execute('INSERT INTO packages_projects (author_id,name,version,host,download_key,price,visible,admin_only,created_at,updated_at) VALUES (?,?,?,?,?,0,1,0,NOW(),NOW())',
          [authorId, release.name, release.version, release.host, release.key]);
        project = Number(result.insertId);
      } else {
        await db.execute('UPDATE packages_projects SET name=?,version=?,download_key=?,visible=1,admin_only=0,updated_at=NOW() WHERE id=? AND author_id=?',
          [release.name, release.version, release.key, project, authorId]);
      }
      mapping[release.id] = project;
      release.project = project;
    }
    const line = 'ODIN_CATALOG_PACK_MAP=' + JSON.stringify(mapping);
    const updatedEnv = /^ODIN_CATALOG_PACK_MAP=.*$/m.test(originalEnv)
      ? originalEnv.replace(/^ODIN_CATALOG_PACK_MAP=.*$/m, line)
      : originalEnv.trimEnd() + '\n' + line + '\n';
    fs.writeFileSync(envFile + '.odin-tmp', updatedEnv, { mode: 0o600 });
    fs.renameSync(envFile + '.odin-tmp', envFile);
    await db.commit(); transaction = false;
    console.log(JSON.stringify({ apply: true, backup, mapping, releases: plan }));
  }
} catch (error) {
  if (transaction) {
    await db.rollback();
    if (originalEnv !== undefined) fs.writeFileSync(envFile, originalEnv, { mode: 0o600 });
  }
  throw error;
} finally {
  await db.end();
  if (cache.has('@/lib/r2-storage')) cache.get('@/lib/r2-storage').getR2Client().destroy();
}
